import { io, Socket } from "socket.io-client";
import { Platform } from "react-native";

// In development, reverse tcp mapping forwards localhost:3001 to the phone.
// We map default dev machine endpoints for both iOS simulator and Android device routing.
const SOCKET_URL = Platform.OS === "android" ? "http://10.0.2.2:3001" : "http://localhost:3001";
const DEV_URL = "http://localhost:3001"; // Used with adb reverse mapping on physical devices

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

    // Connect to backend port 3001 (which is reversed over ADB for your Vivo phone)
    socket = io(DEV_URL, {
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
