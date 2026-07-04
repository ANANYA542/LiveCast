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
    if (messages.length === 0) return [];

    const serverTimestamp = new Date().toISOString(); // Strict sequencing timestamp
    const clientMessageIds = messages.map((m) => m.clientMessageId);

    // 1. Check idempotency: retrieve existing records matching clientMessageIds in a single query
    const existingList = await prisma.chatMessage.findMany({
      where: {
        clientMessageId: { in: clientMessageIds },
      },
      include: {
        user: {
          select: { id: true, displayName: true },
        },
      },
    });

    const existingMap = new Map(existingList.map((m) => [m.clientMessageId, m]));
    const messagesToCreate = messages.filter((m) => !existingMap.has(m.clientMessageId));

    // 2. Create non-existing messages in parallel
    const createdList = await Promise.all(
      messagesToCreate.map((msg) =>
        prisma.chatMessage.create({
          data: {
            streamId: msg.streamId,
            userId,
            content: msg.content,
            clientMessageId: msg.clientMessageId,
            isOfflineSync: true,
            clientTimestamp: msg.clientTimestamp,
            serverTimestamp,
          },
          include: {
            user: {
              select: { id: true, displayName: true },
            },
          },
        })
      )
    );

    const createdMap = new Map(createdList.map((m) => [m.clientMessageId, m]));

    // 3. Map back to original list preserving the input sequence
    return messages
      .map((msg) => existingMap.get(msg.clientMessageId) || createdMap.get(msg.clientMessageId))
      .filter((m): m is Exclude<typeof m, undefined> => !!m);
  },
};
