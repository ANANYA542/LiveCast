import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const apiKey = process.env.LIVEKIT_API_KEY || "devkey";
const apiSecret = process.env.LIVEKIT_API_SECRET || "secret";
const livekitUrl = process.env.LIVEKIT_URL || "http://localhost:7880";

// Sanitize URL protocol (convert ws/wss to http/https for RoomServiceClient rest calls)
const cleanUrl = livekitUrl.replace(/^ws(s)?:\/\//, "http$1://");

// Room service client to handle administrative actions (like deleting rooms)
const roomServiceClient = new RoomServiceClient(cleanUrl, apiKey, apiSecret);

export const LiveKitService = {
  /**
   * Generates a participant token to join a specific LiveKit room
   */
  generateToken: async (
    userId: string,
    displayName: string,
    roomName: string,
    canPublish: boolean
  ): Promise<string> => {
    // Instantiate access token
    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: displayName,
    });

    // Grant join permissions
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: canPublish, // true for creator, false for viewer
      canSubscribe: true,     // everyone can watch
    });

    return await token.toJwt();
  },

  /**
   * Deletes a LiveKit room administratively, disconnecting all participants
   */
  deleteRoom: async (roomName: string): Promise<void> => {
    try {
      await roomServiceClient.deleteRoom(roomName);
    } catch (error: any) {
      // If the room doesn't exist on LiveKit (e.g. already empty/closed), log and ignore
      console.warn(`[LiveKit Service]: Failed to delete room ${roomName} on server:`, error.message);
    }
  }
};
