import { Router, Request, Response } from "express";
import { ChatService } from "../services/chatService";
import { broadcastNewMessage } from "../socket";

export const chatRouter = Router();

/**
 * GET /api/chat/:streamId/messages - Fetch chronological message log for a stream
 */
chatRouter.get("/:streamId/messages", async (req: Request, res: Response) => {
  const { streamId } = req.params;
  const { since } = req.query;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const messages = await ChatService.getMessages(
      streamId,
      100,
      since ? String(since) : undefined
    );
    res.status(200).json(messages);
  } catch (error: any) {
    console.error("[Get Chat History Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});

/**
 * POST /api/chat/sync - Batch sync offline messages
 */
chatRouter.post("/sync", async (req: Request, res: Response) => {
  const user = req.user;
  const { messages } = req.body;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing or invalid messages array." });
  }

  try {
    const synced = await ChatService.syncMessages(messages, user.id);

    // Broadcast each synced message to its respective room via Socket.IO
    for (const msg of synced) {
      broadcastNewMessage(msg.streamId, msg);
    }

    res.status(200).json({
      message: "Sync completed successfully.",
      syncedCount: synced.length,
      syncedMessages: synced,
    });
  } catch (error: any) {
    console.error("[Chat Batch Sync Error]:", error);
    res.status(500).json({ error: "Internal Server Error", message: error.message });
  }
});
