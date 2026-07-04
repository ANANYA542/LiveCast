import { useState, useEffect, useRef } from "react";
import { Alert } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { api } from "../services/api";
import { SocketManager } from "../services/socket";
import { OutboxService, OutboxMessage } from "../services/outbox";
import { useAuthStore } from "../stores/authStore";

export interface Message {
  id: string;
  streamId: string;
  userId: string;
  content: string;
  clientMessageId: string;
  clientTimestamp: string;
  serverTimestamp?: string;
  isOfflineSync?: boolean;
  user: {
    id: string;
    displayName: string;
  };
  pending?: boolean;
  error?: boolean;
}

export function useChat(streamId: string) {
  const identity = useAuthStore((state) => state.identity);
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [streamEnded, setStreamEnded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  const socketRef = useRef<any>(null);
  const isSyncingRef = useRef(false);
  const lastMessageTimestampRef = useRef<string | null>(null);

  const updateLastTimestamp = (msgs: Message[]) => {
    if (msgs.length === 0) return;
    const times = msgs.map((m) => new Date(m.clientTimestamp).getTime());
    const maxTime = Math.max(...times);
    lastMessageTimestampRef.current = new Date(maxTime).toISOString();
  };

  const syncOutbox = async (retryCount = 0) => {
    if (isSyncingRef.current) return;
    const queue = OutboxService.getQueue();
    if (queue.length === 0) return;

    isSyncingRef.current = true;

    try {
      console.log(`[useChat]: Attempting to sync offline outbox (${queue.length} messages)...`);
      const response = await api.post("/api/chat/sync", { messages: queue });
      const { syncedMessages } = response.data;

      const syncedIds = queue.map((m) => m.clientMessageId);
      OutboxService.dequeue(syncedIds);

      setMessages((prev) => {
        const resolved = prev.map((msg) => {
          const matchingSync = syncedMessages.find((s: any) => s.clientMessageId === msg.clientMessageId);
          return matchingSync ? { ...matchingSync, pending: false } : msg;
        });
        return resolved;
      });

      isSyncingRef.current = false;
      console.log("[useChat]: Offline outbox synchronization succeeded.");
    } catch (err) {
      isSyncingRef.current = false;

      const delay = Math.min(1000 * Math.pow(2, retryCount), 16000);
      console.warn(`[useChat]: Sync failed. Retrying in ${delay / 1000}s... (Attempt #${retryCount + 1})`);

      setTimeout(() => {
        syncOutbox(retryCount + 1);
      }, delay);
    }
  };

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      const currentlyOnline = !!state.isConnected;
      setIsOnline(currentlyOnline);
      if (currentlyOnline && !loading) {
        syncOutbox();
      }
    });

    return () => unsubscribeNet();
  }, [loading]);

  useEffect(() => {
    if (!identity || !streamId) return;

    const loadHistory = async () => {
      try {
        const response = await api.get(`/api/chat/${streamId}/messages`);
        const history = response.data;
        setMessages(history);
        updateLastTimestamp(history);
      } catch (err) {
        console.warn("[useChat]: Failed to load message history:", err);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();

    const socket = SocketManager.connect(identity.id, identity.displayName);
    socketRef.current = socket;
    setIsConnected(socket.connected);

    socket.emit("room:join", { streamId });

    const catchUpMessages = async (sinceTimestamp: string) => {
      try {
        console.log(`[useChat]: Requesting catch-up chat logs since: ${sinceTimestamp}`);
        const response = await api.get(`/api/chat/${streamId}/messages`, {
          params: { since: sinceTimestamp }
        });
        const missed: Message[] = response.data;
        
        if (missed.length > 0) {
          setMessages((prev) => {
            const combined = [...prev, ...missed];
            
            const uniqueMap = new Map<string, Message>();
            for (const m of combined) {
              uniqueMap.set(m.clientMessageId, m);
            }
            
            const uniqueList = Array.from(uniqueMap.values());
            uniqueList.sort((a, b) => new Date(a.clientTimestamp).getTime() - new Date(b.clientTimestamp).getTime());
            
            updateLastTimestamp(uniqueList);
            return uniqueList;
          });
        }
      } catch (err) {
        console.warn("[useChat]: Failed to retrieve catch-up messages:", err);
      }
    };

    socket.on("connect", () => {
      console.log("[useChat]: Socket reconnected. Checking catch-ups...");
      setIsConnected(true);
      
      socket.emit("room:join", { streamId });

      if (lastMessageTimestampRef.current) {
        catchUpMessages(lastMessageTimestampRef.current);
      }
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("chat:new_message", (message: Message) => {
      setMessages((prev) => {
        const exists = prev.findIndex((m) => m.clientMessageId === message.clientMessageId);
        let updatedList: Message[] = [];
        
        if (exists !== -1) {
          const updated = [...prev];
          updated[exists] = { ...message, pending: false };
          updatedList = updated;
        } else {
          updatedList = [...prev, message];
        }
        
        updateLastTimestamp(updatedList);
        return updatedList;
      });
    });

    socket.on("chat:error", (error: { reason: string; message: string; clientMessageId?: string }) => {
      console.warn("[useChat]: Message error from server:", error);

      if (error.reason === "rate_limited") {
        Alert.alert("Spam Alert", "Spam warning: Please stop spamming!");
      }

      if (error.clientMessageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === error.clientMessageId
              ? { ...m, pending: false, error: true }
              : m
          )
        );
      }
    });

    socket.on("viewer_count", (payload: { streamId: string; count: number }) => {
      if (payload.streamId === streamId) {
        setViewerCount(payload.count);
      }
    });

    socket.on("stream:ended", (payload: { streamId: string }) => {
      if (payload.streamId === streamId) {
        setStreamEnded(true);
      }
    });

    return () => {
      if (socket) {
        socket.emit("room:leave", { streamId });
        socket.off("connect");
        socket.off("disconnect");
        socket.off("chat:new_message");
        socket.off("chat:error");
        socket.off("viewer_count");
        socket.off("stream:ended");
      }
    };
  }, [streamId, identity]);

  const sendMessage = (content: string) => {
    if (!identity || !content.trim()) return;

    const clientMessageId = `msg-${identity.id.substring(0, 5)}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const clientTimestamp = new Date().toISOString();

    const optimisticMessage: Message = {
      id: clientMessageId,
      streamId,
      userId: identity.id,
      content,
      clientMessageId,
      clientTimestamp,
      user: {
        id: identity.id,
        displayName: identity.displayName,
      },
      pending: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    const isSocketConnected = socketRef.current && socketRef.current.connected;

    if (!isOnline || !isSocketConnected) {
      console.log("[useChat]: Offline or socket disconnected. Enqueueing chat to outbox.");
      OutboxService.enqueue({
        streamId,
        content,
        clientMessageId,
        clientTimestamp,
      });
      return;
    }

    if (socketRef.current) {
      socketRef.current.emit("chat:message", {
        streamId,
        content,
        clientMessageId,
        clientTimestamp,
      });
    }
  };

  return {
    messages,
    viewerCount,
    streamEnded,
    loading,
    isConnected,
    isOnline,
    sendMessage,
  };
}
