import { Router, Request, Response } from "express";
import { StreamService } from "../services/streamService";
import { LiveKitService } from "../services/livekitService";
import { prisma, redis } from "../config/db";
import { broadcastStreamEnded } from "../socket";

export const streamsRouter = Router();

/**
 * GET /api/streams/categories - Fetch all dynamic categories from Postgres
 */
streamsRouter.get("/categories", async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.status(200).json(categories);
  } catch (error: any) {
    console.error("[Get Categories Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * POST /api/streams
 * STATE: Creates a new stream with status = SCHEDULED.
 * No LiveKit room is started yet — the creator configures details first.
 * Call POST /:id/start when ready to go live.
 */
streamsRouter.post("/", async (req: Request, res: Response) => {
  const { title, description, categoryId } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!title || typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "Title is required." });
  }

  if (!categoryId || typeof categoryId !== "string") {
    return res.status(400).json({ error: "Category is required." });
  }

  try {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      return res.status(404).json({ error: "Category not found." });
    }

    const { stream } = await StreamService.createStream(
      user.id,
      title.trim(),
      categoryId,
      description ? String(description).trim() : undefined
    );

    res.status(201).json({
      message: "Stream created. Call /start when ready to go live.",
      stream,
    });
  } catch (error: any) {
    console.error("[Create Stream Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * POST /api/streams/:id/start
 * STATE TRANSITION: SCHEDULED → LIVE
 * Enforces the state machine — rejects if stream is already LIVE or ENDED.
 * Creates the LiveKit room and returns the creator's publisher token.
 */
streamsRouter.post("/:id/start", async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { stream, token } = await StreamService.startStream(id, user.id, user.displayName);

    res.status(200).json({
      message: "Stream is now live.",
      stream,
      livekitToken: token,
      livekitUrl: process.env.LIVEKIT_URL,
    });
  } catch (error: any) {
    console.error("[Start Stream Error]:", error);
    // 409 Conflict is the correct code for an illegal state transition
    res.status(409).json({ error: "State Transition Conflict", message: error.message });
  }
});

/**
 * GET /api/streams - List all LIVE streams (with optional category filter)
 */
streamsRouter.get("/", async (req: Request, res: Response) => {
  const { category: categorySlug } = req.query;

  try {
    const activeStreams = await StreamService.getActiveStreams(
      categorySlug ? String(categorySlug) : undefined
    );
    res.status(200).json(activeStreams);
  } catch (error: any) {
    console.error("[List Streams Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * GET /api/streams/user/stats - Creator Dashboard analytics (DB-computed, not mocked)
 */
streamsRouter.get("/user/stats", async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const [userStreams, followersCount] = await Promise.all([
      prisma.stream.findMany({
        where: { creatorId: user.id },
        orderBy: { startedAt: "desc" },
        include: {
          category: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.follow.count({ where: { followingId: user.id } }),
    ]);

    const totalPeakViewers = userStreams.reduce((sum, s) => sum + s.peakViewerCount, 0);

    let totalMinutes = 0;
    for (const s of userStreams) {
      if (s.endedAt) {
        const start = new Date(s.startedAt).getTime();
        const end = new Date(s.endedAt).getTime();
        totalMinutes += (end - start) / (1000 * 60);
      }
    }
    const watchTimeHours = parseFloat((totalMinutes / 60).toFixed(1));

    res.status(200).json({
      stats: {
        totalViewers: totalPeakViewers,
        followers: followersCount,
        watchTime: `${watchTimeHours}h`,
        streamCount: userStreams.length,
      },
      streams: userStreams,
    });
  } catch (error: any) {
    console.error("[Get User Stats Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * GET /api/streams/:id - Get details of a single stream (any status)
 */
streamsRouter.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const stream = await StreamService.getStream(id);
    res.status(200).json(stream);
  } catch (error: any) {
    console.error("[Get Stream Error]:", error);
    res.status(404).json({ error: "Not Found", message: error.message });
  }
});

/**
 * POST /api/streams/:id/join - Viewer joins a LIVE stream (read-only token)
 */
streamsRouter.post("/:id/join", async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const stream = await StreamService.getStream(id);

    if (stream.status === "SCHEDULED") {
      return res.status(400).json({ error: "Stream has not started yet." });
    }

    if (stream.status === "ENDED") {
      return res.status(400).json({ error: "This stream has already ended." });
    }

    // Generate viewer token (canPublish: false)
    const token = await LiveKitService.generateToken(
      user.id,
      user.displayName,
      stream.livekitRoomName,
      false
    );

    // Use SCARD on the Redis viewer Set for accurate real-time count
    const currentViewerCount = await redis.scard(`viewers:${id}`);

    res.status(200).json({
      message: "Joined stream successfully.",
      livekitToken: token,
      livekitUrl: process.env.LIVEKIT_URL,
      currentViewerCount,
    });
  } catch (error: any) {
    console.error("[Join Stream Error]:", error);
    res.status(404).json({ error: "Not Found", message: error.message });
  }
});

/**
 * POST /api/streams/:id/end
 * STATE TRANSITION: LIVE → ENDED
 * Enforces the state machine — rejects if not LIVE.
 */
streamsRouter.post("/:id/end", async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const endedStream = await StreamService.endStream(id, user.id);

    // Broadcast stream ended signal via Socket.IO to kick out all viewers
    broadcastStreamEnded(id);

    res.status(200).json({
      message: "Stream ended successfully.",
      stream: endedStream,
    });
  } catch (error: any) {
    console.error("[End Stream Error]:", error);
    res.status(409).json({ error: "State Transition Conflict", message: error.message });
  }
});
