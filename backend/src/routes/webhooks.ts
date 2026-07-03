import { Router, Request, Response } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { prisma, redis } from "../config/db";
import { broadcastViewerCount } from "../socket";
import { n8nTriggers } from "../utils/n8n";

export const webhooksRouter = Router();

const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";

const receiver = new WebhookReceiver(apiKey, apiSecret);

/**
 * Redis key helpers — must match exactly what streamService.ts uses.
 * Viewer presence is tracked as a Set (SADD/SREM/SCARD) rather than a
 * plain counter so that:
 *  - Duplicate joins from the same participant are idempotent (Sets deduplicate).
 *  - SCARD gives the exact distinct viewer count with O(1) complexity.
 *  - If a participant crashes without sending participant_left, we can
 *    still remove their specific member on reconnect / stream end cleanup.
 */
const viewerSetKey = (streamId: string) => `viewers:${streamId}`;
const peakViewersKey = (streamId: string) => `peak_viewers:${streamId}`;

webhooksRouter.post("/livekit", async (req: Request, res: Response) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({ error: "Unauthorized", message: "Missing Authorization header." });
  }

  try {
    const event = await receiver.receive(
      typeof req.body === "string" ? req.body : JSON.stringify(req.body),
      authHeader
    );

    const roomName = event.room?.name;
    if (!roomName) {
      return res.status(200).json({ status: "ignored", message: "Event missing room name." });
    }

    // Resolve the internal streamId from the LiveKit room name
    const stream = await prisma.stream.findUnique({
      where: { livekitRoomName: roomName },
    });

    if (!stream) {
      console.warn(`[LiveKit Webhook]: Unknown room: ${roomName}`);
      return res.status(200).json({ status: "ignored", message: "Room not registered." });
    }

    const streamId = stream.id;
    // The participant identity is the userId we pass when generating the token
    const participantId = event.participant?.identity ?? "unknown";

    if (event.event === "participant_joined") {
      /**
       * SADD adds the participant's userId to the Set.
       * If they somehow re-join without leaving (e.g. reconnect), SADD is a no-op.
       *
       * Exclude the stream creator from the viewer presence counter.
       */
      if (stream.creatorId !== participantId) {
        await redis.sadd(viewerSetKey(streamId), participantId);
      }
      const count = await redis.scard(viewerSetKey(streamId));

      // Update peak count if this is a new high
      const peakRaw = await redis.get(peakViewersKey(streamId));
      const currentPeak = peakRaw ? parseInt(peakRaw, 10) : 0;
      if (count > currentPeak) {
        await redis.set(peakViewersKey(streamId), count);
      }

      // n8n Viewer Milestones Check with local developer test value (3)
      const milestones = [1000, 500, 100, 50, 3];
      for (const m of milestones) {
        if (count >= m) {
          const flagKey = `stream:${streamId}:milestone_${m}_sent`;
          const alreadySent = await redis.get(flagKey);

          if (!alreadySent) {
            await redis.set(flagKey, "true", "EX", 86400); // 24hrs cache
            n8nTriggers.viewerMilestone({
              streamId,
              creatorId: stream.creatorId,
              milestone: m,
              currentCount: count,
            });

            // Create creator notification for this viewer milestone
            await prisma.notification.create({
              data: {
                userId: stream.creatorId,
                type: "viewer_milestone",
                title: `🏆 You hit ${m} viewers — the crowd is loving it! 🎉`,
                message: `Milestone crossed at ${count} current viewers.`,
                createdAt: new Date().toISOString(),
              },
            });
          }
          break; // Check only the highest milestone matched
        }
      }

      console.log(`[LiveKit Webhook]: +joined ${roomName} (${participantId}). Viewers: ${count}`);
      broadcastViewerCount(streamId, count);
    }

    else if (event.event === "participant_left") {
      /**
       * SREM removes the specific participant from the Set.
       * Unlike DECR, this can never go negative — if the member was never in the Set,
       * SREM is a safe no-op.
       */
      await redis.srem(viewerSetKey(streamId), participantId);
      const count = await redis.scard(viewerSetKey(streamId));

      console.log(`[LiveKit Webhook]: -left ${roomName} (${participantId}). Viewers: ${count}`);
      broadcastViewerCount(streamId, count);
    }

    res.status(200).json({ status: "processed", event: event.event });
  } catch (error: any) {
    console.error("[LiveKit Webhook Error]:", error.message);
    res.status(400).json({ error: "Bad Request", message: error.message });
  }
});
