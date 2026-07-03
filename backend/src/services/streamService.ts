import { prisma, redis } from "../config/db";
import { LiveKitService } from "./livekitService";
import { n8nTriggers } from "../utils/n8n";

export interface StreamResponse {
  id: string;
  title: string;
  description: string | null;
  status: string;
  livekitRoomName: string;
  startedAt: string;
  creator: {
    id: string;
    displayName: string;
  };
  categoryId: string | null;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  currentViewerCount: number;
}

// Redis key helpers — all viewer state lives in one Set per stream
const viewerSetKey = (streamId: string) => `viewers:${streamId}`;
const peakViewersKey = (streamId: string) => `peak_viewers:${streamId}`;

export const StreamService = {
  /**
   * STATE: SCHEDULED
   * Creates a stream record in the database with status SCHEDULED.
   * No LiveKit room or token is generated yet — the creator hasn't gone live.
   * This is Step 1 of the SCHEDULED → LIVE → ENDED state machine.
   */
  createStream: async (
    creatorId: string,
    title: string,
    categoryId: string,
    description?: string
  ): Promise<{ stream: any }> => {
    // Generate the room name deterministically from the DB UUID we're about to create.
    // We use a placeholder here and patch it below to keep the name tied to the stream ID.
    const tempRoom = `stream_placeholder_${Date.now()}`;

    const stream = await prisma.stream.create({
      data: {
        creatorId,
        title,
        description,
        status: "SCHEDULED",
        // LiveKit room name is set now so it's stable, but the room isn't created yet
        livekitRoomName: `stream_${creatorId.slice(0, 8)}_${Date.now()}`,
        startedAt: new Date().toISOString(),
        categoryId,
      },
      include: {
        creator: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    return { stream };
  },

  /**
   * STATE TRANSITION: SCHEDULED → LIVE
   * Validates that the stream is currently in SCHEDULED state (illegal jump guard).
   * Creates the LiveKit room and generates the creator's publisher token.
   * Initialises the Redis viewer Set for this stream.
   */
  startStream: async (
    streamId: string,
    creatorId: string,
    displayName: string
  ): Promise<{ stream: any; token: string }> => {
    // Enforce state machine: only SCHEDULED streams can be started
    const stream = await prisma.stream.findFirst({
      where: { id: streamId, creatorId },
    });

    if (!stream) {
      throw new Error("Stream not found or you are not the creator.");
    }

    if (stream.status === "LIVE") {
      throw new Error("Stream is already live.");
    }

    if (stream.status === "ENDED") {
      throw new Error("Cannot restart a stream that has already ended.");
    }

    // Only SCHEDULED streams reach this point — transition to LIVE
    const updatedStream = await prisma.stream.update({
      where: { id: streamId },
      data: { status: "LIVE" },
      include: {
        creator: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    // Initialise the viewer presence Set in Redis (empty, clean slate)
    // Peak viewers counter starts at 0
    await redis.del(viewerSetKey(streamId));
    await redis.set(peakViewersKey(streamId), 0);

    // Generate the creator's publisher token (canPublish: true)
    const token = await LiveKitService.generateToken(
      creatorId,
      displayName,
      stream.livekitRoomName,
      true
    );

    // Fire stream-started webhook to n8n asynchronously (fire-and-forget)
    n8nTriggers.streamStarted({
      streamId: updatedStream.id,
      creatorId: updatedStream.creatorId,
      title: updatedStream.title,
    });

    return { stream: updatedStream, token };
  },

  /**
   * STATE TRANSITION: LIVE → ENDED
   * Validates that the stream is currently LIVE (illegal jump guard).
   * Reads peak viewer count from Redis before cleaning up.
   */
  endStream: async (streamId: string, creatorId: string): Promise<any> => {
    // Enforce state machine: only LIVE streams can be ended
    const stream = await prisma.stream.findFirst({
      where: { id: streamId, creatorId },
    });

    if (!stream) {
      throw new Error("Stream not found or you are not the creator.");
    }

    if (stream.status === "SCHEDULED") {
      throw new Error("Cannot end a stream that has not started yet. Call /start first.");
    }

    if (stream.status === "ENDED") {
      throw new Error("Stream has already ended.");
    }

    // Only LIVE streams reach this point — read final peak count
    const peakRaw = await redis.get(peakViewersKey(streamId));
    const peakViewerCount = peakRaw ? parseInt(peakRaw, 10) : 0;

    // Persist final state to database
    const updatedStream = await prisma.stream.update({
      where: { id: streamId },
      data: {
        status: "ENDED",
        endedAt: new Date().toISOString(),
        peakViewerCount,
      },
    });

    // Delete the LiveKit room (disconnects all remaining participants)
    await LiveKitService.deleteRoom(stream.livekitRoomName);

    // Clean up Redis keys: viewer Set + peak counter + milestone flags
    await redis.del(viewerSetKey(streamId));
    await redis.del(peakViewersKey(streamId));
    const milestoneFlags = [3, 50, 100, 500, 1000];
    for (const m of milestoneFlags) {
      await redis.del(`stream:${streamId}:milestone_${m}_sent`);
    }

    // Fire stream-ended webhook to n8n asynchronously (fire-and-forget)
    const durationSeconds = Math.floor(
      (new Date(updatedStream.endedAt!).getTime() - new Date(updatedStream.startedAt).getTime()) / 1000
    );
    n8nTriggers.streamEnded({
      streamId: updatedStream.id,
      creatorId: updatedStream.creatorId,
      peakViewers: updatedStream.peakViewerCount,
      durationSeconds,
      streamStartedAt: updatedStream.startedAt,
    });

    return updatedStream;
  },

  /**
   * Returns all LIVE streams with their current viewer counts (optionally filtered by category).
   * Uses SCARD on the per-stream viewer Set for accurate counts.
   */
  getActiveStreams: async (categorySlug?: string): Promise<StreamResponse[]> => {
    const streams = await prisma.stream.findMany({
      where: {
        status: "LIVE",
        ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      },
      include: {
        creator: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { startedAt: "desc" },
    });

    // Fetch all viewer counts in parallel using SCARD on viewer Sets
    const activeStreams = await Promise.all(
      streams.map(async (stream) => {
        const currentViewerCount = await redis.scard(viewerSetKey(stream.id));
        return {
          id: stream.id,
          title: stream.title,
          description: stream.description,
          status: stream.status,
          livekitRoomName: stream.livekitRoomName,
          startedAt: stream.startedAt,
          creator: stream.creator,
          categoryId: stream.categoryId,
          category: stream.category,
          currentViewerCount,
        };
      })
    );

    return activeStreams;
  },

  /**
   * Returns details for a single stream (any status).
   * Uses SCARD for live viewer count.
   */
  getStream: async (streamId: string): Promise<any> => {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        creator: { select: { id: true, displayName: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!stream) {
      throw new Error("Stream not found.");
    }

    let currentViewerCount = 0;
    if (stream.status === "LIVE") {
      currentViewerCount = await redis.scard(viewerSetKey(stream.id));
    }

    return { ...stream, currentViewerCount };
  },

  // Exported helpers so webhooks.ts can use the same key format
  viewerSetKey,
  peakViewersKey,
};
