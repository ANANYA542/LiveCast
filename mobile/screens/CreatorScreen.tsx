import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
  Platform,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
} from "react-native";
import { LiveKitRoom, VideoView, useLocalParticipant } from "@livekit/react-native";
import { Track } from "livekit-client";
import { api } from "../services/api";
import { Theme } from "../constants/Theme";
import { SocketManager } from "../services/socket";
import { useChat } from "../hooks/useChat";

interface Category {
  id: string;
  name: string;
  slug: string;
}

// Helper to request runtime permissions on Android
const requestAndroidPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== "android") return true;

  try {
    const { PermissionsAndroid } = require("react-native");
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);

    const cameraGranted =
      results[PermissionsAndroid.PERMISSIONS.CAMERA] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const audioGranted =
      results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] ===
      PermissionsAndroid.RESULTS.GRANTED;

    return cameraGranted && audioGranted;
  } catch (error) {
    console.warn("[Permission Request Error]:", error);
    return false;
  }
};

// Inner component that runs inside the LiveKitRoom context to access hooks
function BroadcastViewer({ onEnd, streamId }: { onEnd: () => void; streamId: string }) {
  const { localParticipant, cameraTrack } = useLocalParticipant();
  const [seconds, setSeconds] = useState(0);
  const [peakViewers, setPeakViewers] = useState(0);

  // Mic & Camera state
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Chat input display toggle
  const [showInput, setShowInput] = useState(false);
  const [chatText, setChatText] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // Retrieve local video track
  const videoTrack = cameraTrack?.videoTrack;

  // Use the exact same real-time chat hook as the viewer
  const { messages, viewerCount, sendMessage, isOnline, isConnected } = useChat(streamId);

  // Track peak viewers dynamically
  useEffect(() => {
    if (viewerCount > peakViewers) {
      setPeakViewers(viewerCount);
    }
  }, [viewerCount, peakViewers]);

  // Ensure initial publish of local tracks
  useEffect(() => {
    if (localParticipant) {
      localParticipant.setCameraEnabled(true);
      localParticipant.setMicrophoneEnabled(true);
    }
  }, [localParticipant]);

  // Stream duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll chat list
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleToggleMic = () => {
    if (localParticipant) {
      const nextState = !isMuted;
      localParticipant.setMicrophoneEnabled(!nextState);
      setIsMuted(nextState);
    }
  };

  const handleToggleCamera = () => {
    if (localParticipant) {
      const nextState = !isCameraOff;
      localParticipant.setCameraEnabled(!nextState);
      setIsCameraOff(nextState);
    }
  };

  const handleSendChat = () => {
    if (!chatText.trim()) return;
    sendMessage(chatText.trim());
    setChatText("");
    setShowInput(false);
    Keyboard.dismiss();
  };

  const handleAnalyticsInfo = () => {
    Alert.alert(
      "Broadcast Performance",
      `Peak Viewers: ${peakViewers}\nCurrent Viewers: ${viewerCount}\nConnection Status: Excellent\nDuration: ${formatDuration(seconds)}`
    );
  };

  // Chat message colors palette to match Figma screenshot (colors for usernames)
  const colors = ["#FF8A8A", "#8AFF8A", "#8A8AFF", "#FFEA8A", "#FFA8EA", "#A8FFEA"];
  const getSenderColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash % colors.length);
    return colors[index];
  };

  return (
    <KeyboardAvoidingView
      style={styles.fullscreen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Video Preview Background */}
      {videoTrack && !isCameraOff ? (
        <VideoView videoTrack={videoTrack} style={StyleSheet.absoluteFillObject} />
      ) : (
        <View style={[styles.fullscreen, styles.center, { backgroundColor: "#121214" }]}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
          <Text style={styles.connectingText}>
            {isCameraOff ? "Camera is turned off" : "Initializing Camera Feed..."}
          </Text>
        </View>
      )}

      {/* Floating UI Elements Over Video Feed */}
      <View style={styles.floatingOverlay}>
        {/* Top Header Bar */}
        <SafeAreaView style={styles.floatTopBar}>
          <View style={styles.badgeRow}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
            <View style={styles.timerBadge}>
              <Text style={styles.timerText}>{formatDuration(seconds)}</Text>
            </View>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.viewerBadge}>
              <Text style={styles.viewerText}>👁 {viewerCount}</Text>
            </View>
            <View style={styles.signalBadge}>
              <Text style={styles.signalIcon}>📶</Text>
            </View>
          </View>
        </SafeAreaView>

        {/* Dynamic Chat Messages Overlay (Bottom Left) */}
        <View style={styles.chatOverlayContainer}>
          <FlatList
            ref={flatListRef}
            data={messages.slice(-20)} // Only show the last 20 messages to keep UI clean
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.chatScrollContent}
            renderItem={({ item }) => (
              <View style={styles.creatorChatRow}>
                <Text style={[styles.creatorChatSender, { color: getSenderColor(item.user.displayName) }]}>
                  {item.user.displayName}:{" "}
                </Text>
                <Text style={styles.creatorChatContent}>{item.content}</Text>
                {item.pending && <Text style={styles.statusLabel}> 🕐</Text>}
                {item.error && <Text style={styles.statusLabelError}> ⚠️ Fail</Text>}
                {!item.pending && !item.error && <Text style={styles.statusLabelCheck}> ✓</Text>}
              </View>
            )}
          />
        </View>

        {/* Floating Emoji Reactions Overlay (Bottom Right) */}
        <View style={styles.emojiColumn}>
          <TouchableOpacity onPress={() => sendMessage("❤️")} style={styles.emojiReactionBtn}>
            <Text style={styles.emojiText}>❤️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => sendMessage("🔥")} style={styles.emojiReactionBtn}>
            <Text style={styles.emojiText}>🔥</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => sendMessage("👏")} style={styles.emojiReactionBtn}>
            <Text style={styles.emojiText}>👏</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Translucent Chat Input Box (If toggled open) */}
      {showInput && (
        <SafeAreaView style={styles.creatorInputContainer}>
          <View style={styles.creatorInputRow}>
            <TextInput
              style={styles.creatorChatInput}
              placeholder="Send message to stream..."
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              value={chatText}
              onChangeText={setChatText}
              maxLength={150}
              autoFocus={true}
              onSubmitEditing={handleSendChat}
            />
            <TouchableOpacity style={styles.creatorSendBtn} onPress={handleSendChat}>
              <Text style={styles.creatorSendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      {/* Bottom Opaque Control Dashboard */}
      <SafeAreaView style={styles.dashboardContainer}>
        {/* Status Line */}
        <View style={styles.statusLine}>
          <View>
            <Text style={styles.peakViewersText}>Peak viewers: {peakViewers}</Text>
            <Text style={styles.performanceSub}>Your stream is performing great!</Text>
          </View>
          <View style={styles.connectionBadge}>
            <View style={styles.greenDot} />
            <Text style={styles.connectionTextText}>Excellent</Text>
          </View>
        </View>

        {/* Buttons Row */}
        <View style={styles.controlButtonsRow}>
          <TouchableOpacity
            style={[styles.circleButton, isMuted && styles.circleButtonAlert]}
            onPress={handleToggleMic}
          >
            <Text style={styles.circleButtonIcon}>{isMuted ? "🔇" : "🎙️"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.circleButton, isCameraOff && styles.circleButtonAlert]}
            onPress={handleToggleCamera}
          >
            <Text style={styles.circleButtonIcon}>{isCameraOff ? "🙈" : "📷"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.circleButton, showInput && styles.circleButtonActive]}
            onPress={() => setShowInput(!showInput)}
          >
            <Text style={styles.circleButtonIcon}>💬</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.circleButton} onPress={handleAnalyticsInfo}>
            <Text style={styles.circleButtonIcon}>📊</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.endBroadcastBtn} onPress={onEnd}>
            <Text style={styles.endBroadcastBtnText}>End</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

export default function CreatorScreen({ onGoBack }: { onGoBack: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [privacy, setPrivacy] = useState<"public" | "followers_only">("public");
  const [tags, setTags] = useState("");


  // Load categories from database on mount
  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const resp = await api.get("/api/streams/categories");
      setCategories(resp.data);
      if (resp.data.length > 0) {
        setSelectedCategoryId(resp.data[0].id);
      }
    } catch (e) {
      console.warn("Failed to fetch stream categories:", e);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleGoLive = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      Alert.alert("Error", "Please enter a stream title.");
      return;
    }

    if (!selectedCategoryId) {
      Alert.alert("Error", "Please select a stream category.");
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    const hasPermissions = await requestAndroidPermissions();
    if (!hasPermissions) {
      setLoading(false);
      Alert.alert(
        "Permission Denied",
        "Camera and Microphone permissions are required to broadcast live streams."
      );
      return;
    }

    try {
      // Step 1: Create the stream record (status = SCHEDULED)
      const createResponse = await api.post("/api/streams", {
        title: cleanTitle,
        description: description.trim() || undefined,
        categoryId: selectedCategoryId,
      });

      const createdStream = createResponse.data.stream;

      // Step 2: Transition SCHEDULED → LIVE, get LiveKit publisher token
      const startResponse = await api.post(`/api/streams/${createdStream.id}/start`);
      const { stream, livekitToken, livekitUrl } = startResponse.data;

      setStreamId(stream.id);
      setToken(livekitToken);
      setUrl(livekitUrl);
    } catch (error: any) {
      console.error("[Go Live Error]:", error);
      Alert.alert("Error", error.response?.data?.message || "Failed to start stream.");
    } finally {
      setLoading(false);
    }
  };

  const handleEndStream = async () => {
    if (!streamId) return;

    Alert.alert(
      "End Broadcast",
      "Are you sure you want to end this live stream?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Stream",
          style: "destructive",
          onPress: async () => {
            try {
              await api.post(`/api/streams/${streamId}/end`);
            } catch (e) {
              console.warn("Failed to end stream on backend:", e);
            }
            // Clear stream state and return to dashboard
            setStreamId(null);
            setToken(null);
            setUrl(null);
            onGoBack();
          },
        },
      ]
    );
  };

  // If streaming token and URL are active, load the LiveKitRoom
  if (token && url && streamId) {
    return (
      <View style={styles.container}>
        <LiveKitRoom
          serverUrl={url}
          token={token}
          connect={true}
          audio={true}
          video={true}
          options={{
            publishDefaults: {
              simulcast: false,
              videoCodec: "vp8",
            },
            videoCaptureDefaults: {
              resolution: {
                width: 640,
                height: 360,
                frameRate: 24,
              }
            }
          }}
        >
          <BroadcastViewer onEnd={handleEndStream} streamId={streamId} />
        </LiveKitRoom>
      </View>
    );
  }

  const getCategoryEmoji = (slug: string) => {
    switch (slug) {
      case "music": return "🎵";
      case "food": return "🍜";
      case "tech": return "💻";
      case "wellness": return "🧘";
      case "art": return "🎨";
      case "sports": return "⚽";
      default: return "🎮";
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.setupContainer}>
        {/* Setup Header */}
        <View style={styles.setupHeader}>
          <TouchableOpacity style={styles.backButtonCircle} onPress={onGoBack}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.setupTitle}>Go Live Setup</Text>
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          
          {/* Camera Preview Card */}
          <View style={styles.cameraPreviewCard}>
            <View style={styles.cameraPreviewCenter}>
              <Text style={styles.cameraPreviewIcon}>📷</Text>
              <Text style={styles.cameraPreviewText}>Camera Preview</Text>
            </View>
            <TouchableOpacity style={styles.cameraSwapButton}>
              <Text style={styles.cameraSwapIcon}>🔄</Text>
            </TouchableOpacity>
          </View>

          {/* Title Input */}
          <Text style={styles.labelUppercase}>STREAM TITLE</Text>
          <TextInput
            style={styles.inputPremium}
            placeholder="Give your stream a great title..."
            placeholderTextColor={Theme.colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={60}
          />

          {/* Category Input */}
          <Text style={styles.labelUppercase}>CATEGORY</Text>
          {categoriesLoading ? (
            <ActivityIndicator color={Theme.colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.categoriesRow}>
              {categories.map((c) => {
                const isSelected = selectedCategoryId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.categoryCardPremium,
                      isSelected && styles.categoryCardPremiumSelected,
                    ]}
                    onPress={() => setSelectedCategoryId(c.id)}
                  >
                    <Text
                      style={[
                        styles.categoryCardPremiumText,
                        isSelected && styles.categoryCardPremiumTextSelected,
                      ]}
                    >
                      {getCategoryEmoji(c.slug)} {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Privacy Toggle */}
          <Text style={styles.labelUppercase}>PRIVACY</Text>
          <View style={styles.privacyRow}>
            <TouchableOpacity
              style={[
                styles.privacyButton,
                privacy === "public" && styles.privacyButtonSelected,
              ]}
              onPress={() => setPrivacy("public")}
            >
              <Text
                style={[
                  styles.privacyButtonText,
                  privacy === "public" && styles.privacyButtonTextSelected,
                ]}
              >
                🌐 Public
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.privacyButton,
                privacy === "followers_only" && styles.privacyButtonSelected,
              ]}
              onPress={() => setPrivacy("followers_only")}
            >
              <Text
                style={[
                  styles.privacyButtonText,
                  privacy === "followers_only" && styles.privacyButtonTextSelected,
                ]}
              >
                🔒 Followers Only
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tags Section */}
          <Text style={styles.labelUppercase}>TAGS</Text>
          <TextInput
            style={styles.inputPremium}
            placeholder="# Add tags to reach more viewers..."
            placeholderTextColor={Theme.colors.textMuted}
            value={tags}
            onChangeText={setTags}
            maxLength={60}
          />
          <View style={styles.tagsRow}>
            <View style={styles.tagPill}><Text style={styles.tagPillText}>#live</Text></View>
            <View style={styles.tagPill}><Text style={styles.tagPillText}>#music</Text></View>
            <View style={styles.tagPill}><Text style={styles.tagPillText}>#vibes</Text></View>
          </View>

          {/* Start Broadcast Button */}
          <TouchableOpacity
            style={[
              styles.goLiveButtonPremium,
              (!title.trim() || !selectedCategoryId) && styles.disabledButtonPremium,
            ]}
            onPress={handleGoLive}
            disabled={loading || categoriesLoading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.goLiveButtonPremiumText}>● Start Broadcast</Text>
            )}
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  fullscreen: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  setupContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  setupHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: Theme.colors.border,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: Theme.colors.primary,
    fontWeight: "bold",
  },
  setupTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  form: {
    padding: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.text,
    marginBottom: 8,
  },
  input: {
    height: 52,
    backgroundColor: Theme.colors.inputBg,
    borderRadius: Theme.roundness.medium,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Theme.colors.text,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  textArea: {
    height: 100,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: "top",
  },
  goLiveButton: {
    height: 56,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  disabledButton: {
    opacity: 0.6,
  },
  goLiveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  connectingText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 12,
  },
  loader: {
    marginVertical: 10,
    alignSelf: "flex-start",
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 20,
  },
  categoryCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Theme.roundness.small,
    backgroundColor: Theme.colors.inputBg,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  categoryCardSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  categoryCardText: {
    fontSize: 14,
    color: Theme.colors.text,
    fontWeight: "600",
  },
  categoryCardTextSelected: {
    color: "#FFFFFF",
  },

  // Floating Overlay Elements
  floatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  floatTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 44 : 20,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveBadge: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.roundness.small,
  },
  liveBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  timerBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.roundness.small,
    marginLeft: 6,
  },
  timerText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },
  viewerBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.roundness.small,
  },
  viewerText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },
  signalBadge: {
    backgroundColor: "#34C759",
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  signalIcon: {
    fontSize: 12,
    color: "#FFFFFF",
  },
  chatOverlayContainer: {
    position: "absolute",
    bottom: 20,
    left: 16,
    width: "68%",
    maxHeight: 180,
  },
  chatScrollContent: {
    paddingVertical: 4,
  },
  creatorChatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  creatorChatSender: {
    fontSize: 13,
    fontWeight: "700",
  },
  creatorChatContent: {
    fontSize: 13,
    color: "#FFFFFF",
  },
  emojiColumn: {
    position: "absolute",
    bottom: 20,
    right: 16,
    alignItems: "center",
  },
  emojiReactionBtn: {
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emojiText: {
    fontSize: 18,
  },

  // Translucent Input
  creatorInputContainer: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 140 : 130,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    zIndex: 100,
  },
  creatorInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  creatorChatInput: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    color: "#FFFFFF",
    fontSize: 14,
  },
  creatorSendBtn: {
    marginLeft: 12,
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
  },
  creatorSendBtnText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 13,
  },

  // Bottom Dashboard Panel
  dashboardContainer: {
    backgroundColor: "#000000",
    borderTopWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
  },
  statusLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  peakViewersText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  performanceSub: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.45)",
    marginTop: 1,
  },
  connectionBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34C759",
    marginRight: 4,
  },
  connectionTextText: {
    fontSize: 12,
    color: "#34C759",
    fontWeight: "bold",
  },
  controlButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  circleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  circleButtonAlert: {
    backgroundColor: "#FF3B30",
  },
  circleButtonIcon: {
    fontSize: 18,
  },
  endBroadcastBtn: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: "center",
  },
  endBroadcastBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  statusLabel: {
    fontSize: 10,
    color: "rgba(255, 255, 255, 0.5)",
  },
  statusLabelError: {
    fontSize: 10,
    color: "#FF3B30",
    fontWeight: "bold",
  },
  statusLabelCheck: {
    fontSize: 10,
    color: "#34C759",
    fontWeight: "bold",
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraPreviewCard: {
    height: 180,
    borderRadius: Theme.roundness.large,
    backgroundColor: "#3A3834",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    position: "relative",
    overflow: "hidden",
  },
  cameraPreviewCenter: {
    alignItems: "center",
  },
  cameraPreviewIcon: {
    fontSize: 32,
    color: "#FAF7F2",
    marginBottom: 8,
    opacity: 0.8,
  },
  cameraPreviewText: {
    fontSize: 14,
    color: "#FAF7F2",
    fontWeight: "600",
    opacity: 0.7,
  },
  cameraSwapButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraSwapIcon: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  labelUppercase: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#8E8A85",
    marginBottom: 8,
    marginTop: 20,
    textTransform: "uppercase",
  },
  inputPremium: {
    height: 52,
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.medium,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Theme.colors.text,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  categoryCardPremium: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  categoryCardPremiumSelected: {
    backgroundColor: "#1F2024",
    borderColor: "#1F2024",
  },
  categoryCardPremiumText: {
    fontSize: 14,
    color: Theme.colors.text,
    fontWeight: "600",
  },
  categoryCardPremiumTextSelected: {
    color: "#FFFFFF",
  },
  privacyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  privacyButton: {
    flex: 1,
    height: 50,
    borderRadius: Theme.roundness.medium,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  privacyButtonSelected: {
    backgroundColor: "#1F2024",
    borderColor: "#1F2024",
  },
  privacyButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.colors.text,
  },
  privacyButtonTextSelected: {
    color: "#FFFFFF",
  },
  tagsRow: {
    flexDirection: "row",
    marginTop: 8,
    marginBottom: 12,
  },
  tagPill: {
    backgroundColor: "#F2EDE4",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  tagPillText: {
    fontSize: 12,
    color: "#8E8A85",
    fontWeight: "600",
  },
  goLiveButtonPremium: {
    height: 56,
    backgroundColor: "#EE5D49",
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    marginBottom: 20,
    shadowColor: "#EE5D49",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  disabledButtonPremium: {
    opacity: 0.6,
  },
  goLiveButtonPremiumText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
});
