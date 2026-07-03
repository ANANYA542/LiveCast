import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { LiveKitRoom, VideoView, useTracks, useConnectionState } from "@livekit/react-native";
import { Track } from "livekit-client";
import { api } from "../services/api";
import { useChat } from "../hooks/useChat";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

// Inner component inside LiveKitRoom to hook up to subscriber tracks
function WatcherPanel({
  streamId,
  creatorId,
  creatorName,
  title,
  onGoBack,
}: {
  streamId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  onGoBack: () => void;
}) {
  const identity = useAuthStore((state) => state.identity);
  const [inputText, setInputText] = useState("");
  const [isFollowing, setIsFollowing] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Hook into our Socket.IO Real-Time Chat & Metadata service
  const { messages, viewerCount, streamEnded, loading: chatLoading, isConnected, isOnline, sendMessage } = useChat(streamId);

  // Retrieve remote video tracks
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }]);
  const remoteVideoTrack = tracks[0]?.publication?.videoTrack;

  // Retrieve WebRTC stream connection state (connecting | connected | reconnecting | disconnected)
  const connectionState = useConnectionState();

  // Sync follow state on load
  useEffect(() => {
    checkFollowStatus();
  }, []);

  // Auto-scroll chat to bottom when a new message arrives
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const checkFollowStatus = async () => {
    try {
      const response = await api.get("/api/users/following");
      const followingList = response.data;
      const isFav = followingList.some((fav: any) => fav.id === creatorId);
      setIsFollowing(isFav);
    } catch (e) {
      console.warn("Failed to check follow status:", e);
    }
  };

  const handleFollowToggle = async () => {
    try {
      if (isFollowing) {
        await api.delete(`/api/users/${creatorId}/follow`);
      } else {
        await api.post(`/api/users/${creatorId}/follow`);
      }
      setIsFollowing(!isFollowing);
    } catch (e) {
      console.warn("Failed to toggle follow status:", e);
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(inputText.trim());
    setInputText("");
  };

  // Render stream ended state
  if (streamEnded) {
    return (
      <View style={[styles.fullscreen, styles.center, { backgroundColor: Theme.colors.background }]}>
        <Text style={styles.endedIcon}>🎬</Text>
        <Text style={styles.endedTitle}>Broadcast Finished</Text>
        <Text style={styles.endedSubtitle}>The creator has ended this stream.</Text>
        <TouchableOpacity style={styles.goBackBtn} onPress={onGoBack}>
          <Text style={styles.goBackBtnText}>Back to Discover</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.fullscreen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 40 : 0}
    >
      {/* 1. Video Player Section (Top 45% of Screen) */}
      <View style={styles.videoContainer}>
        {remoteVideoTrack && connectionState !== "reconnecting" ? (
          <VideoView videoTrack={remoteVideoTrack} style={StyleSheet.absoluteFillObject} />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, styles.center, { backgroundColor: "#000000" }]}>
            <ActivityIndicator size="large" color={Theme.colors.primary} />
            <Text style={styles.connectingText}>
              {connectionState === "reconnecting" ? "Reconnecting stream..." : "Buffering Video Feed..."}
            </Text>
          </View>
        )}

        {/* Top Floating Badges */}
        <SafeAreaView style={styles.floatContainer}>
          <View style={styles.floatHeader}>
            <TouchableOpacity style={styles.closeButton} onPress={onGoBack}>
              <Text style={styles.closeButtonText}>←</Text>
            </TouchableOpacity>

            <View style={styles.badgeRow}>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
              </View>
              <View style={styles.viewerBadge}>
                <Text style={styles.viewerBadgeText}>👁 {viewerCount}</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* 2. Creator metadata & Follow banner */}
      <View style={styles.metaRow}>
        <View style={styles.metaLeft}>
          <Text style={styles.streamTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.creatorName}>by {creatorName}</Text>
        </View>
        
        {identity?.id !== creatorId && (
          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followingButton]}
            onPress={handleFollowToggle}
          >
            <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
              {isFollowing ? "Following" : "+ Follow"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 3. Real-Time Chat Scroll Area */}
      <View style={styles.chatContainer}>
        {!isOnline && (
          <View style={[styles.reconnectBanner, { backgroundColor: "#FFF9E6", borderColor: "#FFCC00" }]}>
            <Text style={[styles.reconnectBannerText, { color: "#B78103" }]}>⚠️ Device Offline. Queueing messages locally...</Text>
          </View>
        )}
        {isOnline && !isConnected && (
          <View style={styles.reconnectBanner}>
            <Text style={styles.reconnectBannerText}>⚠️ Chat Disconnected. Reconnecting...</Text>
          </View>
        )}
        {chatLoading ? (
          <ActivityIndicator size="small" color={Theme.colors.primary} style={{ margin: 20 }} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatScroll}
            renderItem={({ item }) => {
              const isOwn = item.userId === identity?.id;
              return (
                <View style={[styles.chatBubble, isOwn && styles.chatBubbleOwn]}>
                  <View style={styles.chatHeader}>
                    <Text style={styles.chatSender}>{item.user.displayName}</Text>
                    
                    {/* Delivery & optimistic status indicators */}
                    {item.pending && <Text style={styles.statusLabel}> 🕐</Text>}
                    {item.error && <Text style={styles.statusLabelError}> ⚠️ Fail</Text>}
                    {!item.pending && !item.error && <Text style={styles.statusLabelCheck}> ✓</Text>}
                  </View>
                  <Text style={styles.chatContent}>{item.content}</Text>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* 4. Chat Input Box */}
      <SafeAreaView style={styles.inputContainer}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Say something..."
            placeholderTextColor={Theme.colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            maxLength={200}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export default function ViewerLiveScreen({
  streamId,
  onGoBack,
}: {
  streamId: string;
  onGoBack: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch JOIN parameters from Backend
  useEffect(() => {
    if (streamId) {
      joinStreamSession();
    }
  }, [streamId]);

  const joinStreamSession = async () => {
    try {
      // Fetch both stream subscription token and stream metadata details in parallel
      const [joinResp, detailResp] = await Promise.all([
        api.post(`/api/streams/${streamId}/join`),
        api.get(`/api/streams/${streamId}`),
      ]);

      const { livekitToken, livekitUrl } = joinResp.data;
      setStreamInfo(detailResp.data);
      setToken(livekitToken);
      setUrl(livekitUrl);
    } catch (e: any) {
      console.warn("Failed to join stream session:", e);
      Alert.alert(
        "Join Error",
        e.response?.data?.error || "This broadcast is no longer live.",
        [{ text: "OK", onPress: onGoBack }]
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.fullscreen, styles.center, { backgroundColor: Theme.colors.background }]}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Connecting to stream...</Text>
      </View>
    );
  }

  // If parameters are fetched, load the LiveKitRoom wrapper
  if (token && url && streamInfo) {
    return (
      <View style={styles.fullscreen}>
        <LiveKitRoom
          serverUrl={url}
          token={token}
          connect={true}
          audio={true}
          video={true}
          options={{
            adaptiveStream: true,
            dynacast: true,
          }}
        >
          <WatcherPanel
            streamId={streamId}
            creatorId={streamInfo.creatorId}
            creatorName={streamInfo.creator?.displayName || "Broadcaster"}
            title={streamInfo.title}
            onGoBack={onGoBack}
          />
        </LiveKitRoom>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoContainer: {
    height: "40%",
    backgroundColor: "#000000",
    position: "relative",
  },
  floatContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  floatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 40 : 10,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
  badgeRow: {
    flexDirection: "row",
  },
  liveBadge: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 6,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  viewerBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  viewerBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  connectingText: {
    color: "#FFFFFF",
    fontSize: 12,
    marginTop: 8,
  },
  loadingText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
  },
  metaLeft: {
    flex: 1,
    marginRight: 10,
  },
  streamTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 2,
  },
  creatorName: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontWeight: "500",
  },
  followButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Theme.roundness.small,
    backgroundColor: Theme.colors.primary,
  },
  followingButton: {
    backgroundColor: Theme.colors.inputBg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  followButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
  },
  followingButtonText: {
    color: Theme.colors.text,
  },
  chatContainer: {
    flex: 1,
  },
  chatScroll: {
    padding: 16,
  },
  chatBubble: {
    alignSelf: "flex-start",
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.small,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    maxWidth: "80%",
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  chatBubbleOwn: {
    alignSelf: "flex-end",
    backgroundColor: "#FBF8F3", // subtle warm custom tint for own bubbles
    borderColor: Theme.colors.accent,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  chatSender: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.colors.primary,
  },
  chatContent: {
    fontSize: 14,
    color: Theme.colors.text,
  },
  statusLabel: {
    fontSize: 10,
    color: Theme.colors.textMuted,
  },
  statusLabelCheck: {
    fontSize: 10,
    color: "#34C759", // Delivered Checkmark Green
  },
  statusLabelError: {
    fontSize: 9,
    fontWeight: "bold",
    color: "#FF3B30",
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: Theme.colors.border,
    backgroundColor: Theme.colors.surface,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  chatInput: {
    flex: 1,
    height: 44,
    backgroundColor: Theme.colors.inputBg,
    borderRadius: Theme.roundness.medium,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Theme.colors.text,
    marginRight: 10,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 20,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  endedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  endedTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 8,
  },
  endedSubtitle: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    marginBottom: 24,
    textAlign: "center",
  },
  goBackBtn: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: Theme.roundness.medium,
  },
  goBackBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
  reconnectBanner: {
    backgroundColor: "#FDF2F2",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderColor: "#F35B5B",
  },
  reconnectBannerText: {
    color: "#D32F2F",
    fontSize: 12,
    fontWeight: "bold",
  },
});
