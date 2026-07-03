import { Server, Socket } from "socket.io";
import { redis, prisma } from "../config/db";
import { ChatService } from "../services/chatService";
import { n8nTriggers } from "../utils/n8n";

interface ChatMessagePayload {
  streamId: string;
  content: string;
  clientMessageId: string;
  clientTimestamp: string;
}

export function registerChatHandlers(io: Server, socket: Socket) {
  const user = socket.data.user;

  // 1. Join room event
  socket.on("room:join", async (payload: { streamId: string }) => {
    const { streamId } = payload;
    if (!streamId) return;

    socket.join(streamId);
    socket.data.streamId = streamId; // Store streamId for automatic disconnect cleanup
    console.log(`[Socket.IO]: ${user.displayName} joined room: ${streamId}`);

    try {
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { creatorId: true }
      });

      const setKey = `viewers:${streamId}`;
      if (stream && stream.creatorId !== user.id) {
        await redis.sadd(setKey, user.id);
      }
      const count = await redis.scard(setKey);

      // Dynamically compute and store new peak viewer counts
      const peakKey = `peak_viewers:${streamId}`;
      const peakRaw = await redis.get(peakKey);
      const currentPeak = peakRaw ? parseInt(peakRaw, 10) : 0;
      if (count > currentPeak) {
        await redis.set(peakKey, count);
      }

      // n8n Viewer Milestones Check with local developer test value (3)
      if (stream) {
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
      }

      // Broadcast updated count instantly
      io.to(streamId).emit("viewer_count", { streamId, count });
    } catch (e: any) {
      console.warn("[Socket.IO Join Set Error]:", e.message);
    }
  });

  // 2. Leave room event
  socket.on("room:leave", async (payload: { streamId: string }) => {
    const { streamId } = payload;
    if (!streamId) return;

    socket.leave(streamId);
    socket.data.streamId = null;
    console.log(`[Socket.IO]: ${user.displayName} left room: ${streamId}`);

    try {
      const setKey = `viewers:${streamId}`;
      await redis.srem(setKey, user.id);
      const count = await redis.scard(setKey);

      // Broadcast updated count instantly
      io.to(streamId).emit("viewer_count", { streamId, count });
    } catch (e: any) {
      console.warn("[Socket.IO Leave Set Error]:", e.message);
    }
  });

  // 3. Connection drop / Disconnect fallback handler
  socket.on("disconnect", async () => {
    const streamId = socket.data.streamId;
    if (streamId) {
      try {
        const setKey = `viewers:${streamId}`;
        await redis.srem(setKey, user.id);
        const count = await redis.scard(setKey);

        io.to(streamId).emit("viewer_count", { streamId, count });
        console.log(`[Socket.IO]: Auto-removed disconnected user ${user.displayName} from viewers of stream ${streamId}`);
      } catch (e: any) {
        console.warn("[Socket.IO Disconnect Set Cleanup Error]:", e.message);
      }
    }
  });

  // 3. Chat message event
  socket.on("chat:message", async (payload: ChatMessagePayload) => {
    const { streamId, content, clientMessageId, clientTimestamp } = payload;

    if (!streamId || !clientMessageId || !clientTimestamp) {
      socket.emit("chat:error", {
        reason: "validation_failed",
        message: "Missing required chat parameters.",
      });
      return;
    }

    const cleanContent = content?.trim();
    if (!cleanContent) {
      socket.emit("chat:error", {
        reason: "validation_failed",
        message: "Chat content cannot be empty.",
        clientMessageId,
      });
      return;
    }

    if (cleanContent.length > 500) {
      socket.emit("chat:error", {
        reason: "validation_failed",
        message: "Message is too long (maximum 500 characters).",
        clientMessageId,
      });
      return;
    }

    try {
      // 3.5 Check stream status
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { status: true },
      });

      if (!stream || stream.status === "ENDED") {
        console.warn(`[Socket.IO]: Chat blocked on ended stream ${streamId} for user ${user.displayName}`);
        socket.emit("chat:error", {
          reason: "stream_ended",
          message: "Cannot send messages to an ended stream.",
          clientMessageId,
        });
        return;
      }

      // 4. Redis Rate Limiter: 5 messages/second per user
      const rateLimitKey = `rate_limit:${streamId}:${user.id}`;
      const count = await redis.incr(rateLimitKey);
      
      if (count === 1) {
        await redis.expire(rateLimitKey, 1);
      }

      if (count > 5) {
        console.warn(`[Socket.IO]: Rate limit hit for user ${user.displayName} on stream ${streamId}`);
        socket.emit("chat:error", {
          reason: "rate_limited",
          message: "Spam warning: rate limit exceeded (max 5 messages/sec).",
          clientMessageId,
        });
        return;
      }

      // 5. Persist to PostgreSQL database (invokes idempotency key validation)
      const savedMessage = await ChatService.saveMessage({
        streamId,
        userId: user.id,
        content: cleanContent,
        clientMessageId,
        clientTimestamp,
      });

      // 6. Broadcast new message back to everyone in the room
      io.to(streamId).emit("chat:new_message", savedMessage);
    } catch (error: any) {
      console.error("[Socket.IO Chat Error]:", error);
      socket.emit("chat:error", {
        reason: "internal_error",
        message: "Failed to publish message. Please try again.",
        clientMessageId,
      });
    }
  });
}
