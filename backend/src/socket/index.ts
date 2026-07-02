import { Server } from "socket.io";
import { registerChatHandlers } from "./chatHandlers";

let io: Server;

export function initSocket(server: any) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Authentication Middleware: Checks identity handshake attributes
  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    const displayName = socket.handshake.auth?.displayName;

    if (!userId || !displayName) {
      return next(new Error("Authentication error: missing X-User-Id or X-Display-Name in handshake auth"));
    }

    socket.data.user = { id: userId, displayName };
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    console.log(`[Socket.IO]: Socket connected: ${user.displayName} (${socket.id})`);

    // Register stream-specific chat events
    registerChatHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log(`[Socket.IO]: Socket disconnected: ${user.displayName} (${socket.id})`);
    });
  });

  return io;
}

/**
 * Broadcasts the updated viewer presence count to all Socket.IO connections watching the stream.
 */
export const broadcastViewerCount = (streamId: string, count: number) => {
  if (io) {
    console.log(`[Socket.IO]: Broadcasting viewer count for stream ${streamId} -> ${count}`);
    io.to(streamId).emit("viewer_count", { streamId, count });
  }
};

/**
 * Broadcasts a stream ended alert to all viewing sockets.
 */
export const broadcastStreamEnded = (streamId: string) => {
  if (io) {
    console.log(`[Socket.IO]: Broadcasting stream ended for stream ${streamId}`);
    io.to(streamId).emit("stream:ended", { streamId });
  }
};

/**
 * Broadcasts a newly synced or created message to the channel room.
 */
export const broadcastNewMessage = (streamId: string, message: any) => {
  if (io) {
    io.to(streamId).emit("chat:new_message", message);
  }
};
