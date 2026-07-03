import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";

import { API_BASE_URL } from "./api";

const SOCKET_URL = API_BASE_URL;

let socket: Socket | null = null;

export const SocketManager = {
  /**
   * Initializes and connects the Socket.IO client instance.
   */
  connect: (userId: string, displayName: string): Socket => {
    if (socket) {
      if (socket.connected) return socket;
      socket.connect();
      return socket;
    }

    // Connect to backend port 3001 dynamically resolved
    socket = io(SOCKET_URL, {
      auth: {
        userId,
        displayName,
      },
      autoConnect: true,
      transports: ["websocket"], // Force websocket protocol
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("[SocketManager]: Connected to chat socket server.");
    });

    socket.on("connect_error", (error) => {
      console.warn("[SocketManager]: Connection error:", error.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("[SocketManager]: Disconnected from chat socket server. Reason:", reason);
    });

    return socket;
  },

  /**
   * Disconnects the socket instance.
   */
  disconnect: () => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  },

  /**
   * Returns the active socket instance.
   */
  getSocket: (): Socket | null => {
    return socket;
  },
};
