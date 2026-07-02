import { prisma } from "../config/db";

export const ChatService = {
  /**
   * Saves a chat message to the database.
   * Leverages clientMessageId as an idempotency key to prevent double inserts.
   */
  saveMessage: async (params: {
    streamId: string;
    userId: string;
    content: string;
    clientMessageId: string;
    clientTimestamp: string;
    isOfflineSync?: boolean;
  }) => {
    const { streamId, userId, content, clientMessageId, clientTimestamp, isOfflineSync = false } = params;

    // 1. Check idempotency: If message already exists, return it cleanly
    const existing = await prisma.chatMessage.findUnique({
      where: { clientMessageId },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    if (existing) {
      return existing;
    }

    // 2. Insert new message and fetch sender identity info
    return prisma.chatMessage.create({
      data: {
        streamId,
        userId,
        content,
        clientMessageId,
        isOfflineSync,
        clientTimestamp,
        serverTimestamp: new Date().toISOString(),
      },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });
  },

  /**
   * Retrieves chronological chat history for a stream.
   */
  getMessages: async (streamId: string, limit: number = 100, since?: string) => {
    return prisma.chatMessage.findMany({
      where: {
        streamId,
        ...(since ? { clientTimestamp: { gt: since } } : {}),
      },
      orderBy: { clientTimestamp: "asc" },
      take: limit,
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });
  },

  /**
   * Batch syncs offline queued messages.
   * Performs idempotency checks and maintains strict order based on server received timestamp.
   */
  syncMessages: async (
    messages: Array<{
      streamId: string;
      content: string;
      clientMessageId: string;
      clientTimestamp: string;
    }>,
    userId: string
  ) => {
    const results = [];
    const serverTimestamp = new Date().toISOString(); // Strict sequencing timestamp

    for (const msg of messages) {
      const { streamId, content, clientMessageId, clientTimestamp } = msg;

      // 1. Check idempotency: If message already exists, skip it
      const existing = await prisma.chatMessage.findUnique({
        where: { clientMessageId },
        include: {
          user: {
            select: { id: true, displayName: true },
          },
        },
      });

      if (existing) {
        results.push(existing);
        continue;
      }

      // 2. Insert new message flagging it as offline sync and preserving client timestamp
      const saved = await prisma.chatMessage.create({
        data: {
          streamId,
          userId,
          content,
          clientMessageId,
          isOfflineSync: true,
          clientTimestamp,
          serverTimestamp,
        },
        include: {
          user: {
            select: { id: true, displayName: true },
          },
        },
      });

      results.push(saved);
    }

    return results;
  },
};
