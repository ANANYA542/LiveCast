import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  RefreshControl,
} from "react-native";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface PastStream {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  peakViewerCount: number;
  category?: { name: string; slug: string } | null;
}

export default function CreatorDashboardScreen({
  onStartBroadcast,
  onNavigateToAutomations,
}: {
  onStartBroadcast: () => void;
  onNavigateToAutomations: () => void;
}) {
  const identity = useAuthStore((state) => state.identity);
  const mainScrollRef = React.useRef<ScrollView>(null);
  const [streams, setStreams] = useState<PastStream[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalViewers: "0",
    followers: "0",
    watchTime: "0h",
    streamCount: "0",
    followersTrend: "+0",
    viewsTrend: "+0",
    streamsTrend: "+0",
  });

  // Automations brief summary (live n8n values fetched from backend)
  const [automationSummary, setAutomationSummary] = useState({
    activeCount: 0,
    totalCount: 0,
    runsCount: 0,
    errorCount: 0,
  });

  // Schedule Stream Modal State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleDesc, setScheduleDesc] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [scheduleTimeOffset, setScheduleTimeOffset] = useState("4"); // default 4 hours from now
  const [isScheduling, setIsScheduling] = useState(false);

  // Analytics Modal State
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);

  // Followers Modal State
  const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followersActiveTab, setFollowersActiveTab] = useState<"followers" | "following">("followers");

  const loadFollowersData = async () => {
    setFollowersLoading(true);
    try {
      const [fRes, gRes] = await Promise.all([
        api.get("/api/users/followers"),
        api.get("/api/users/following"),
      ]);
      setFollowersList(fRes.data);
      setFollowingList(gRes.data);
    } catch (e) {
      console.warn("Failed to load followers/following lists:", e);
    } finally {
      setFollowersLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    await Promise.all([
      fetchUserStreams(),
      fetchCategories(),
      fetchAutomationsSummary(),
    ]);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchUserStreams(),
      fetchAutomationsSummary(),
    ]);
    setRefreshing(false);
  };

  const fetchUserStreams = async () => {
    try {
      const response = await api.get("/api/streams/user/stats");
      const { stats: backendStats, streams: backendStreams } = response.data;
      
      setStreams(backendStreams);
      setStats({
        totalViewers: backendStats.totalViewers.toLocaleString(),
        followers: backendStats.followers.toLocaleString(),
        watchTime: backendStats.watchTime,
        streamCount: backendStats.streamCount.toString(),
        followersTrend: backendStats.followersTrend || "+0",
        viewsTrend: backendStats.viewsTrend || "+0",
        streamsTrend: backendStats.streamsTrend || "+0",
      });
    } catch (e) {
      console.warn("Failed to load user streams:", e);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get("/api/streams/categories");
      setCategories(response.data);
      if (response.data.length > 0) {
        setSelectedCategoryId(response.data[0].id);
      }
    } catch (e) {
      console.warn("Failed to load categories:", e);
    }
  };

  const fetchAutomationsSummary = async () => {
    try {
      const response = await api.get("/api/automations");
      const { stats: autoStats } = response.data;
      setAutomationSummary({
        activeCount: autoStats.activeWorkflows,
        totalCount: autoStats.totalWorkflows,
        runsCount: autoStats.runsToday,
        errorCount: autoStats.errors,
      });
    } catch (e) {
      console.warn("Failed to fetch automations summary:", e);
    }
  };

  const handleCreateSchedule = async () => {
    if (!scheduleTitle.trim()) {
      alert("Please enter a stream title.");
      return;
    }
    if (!selectedCategoryId) {
      alert("Please select a category.");
      return;
    }

    setIsScheduling(true);
    try {
      // Calculate target date (current time + hours offset)
      const hours = parseFloat(scheduleTimeOffset) || 2;
      const scheduledDate = new Date(Date.now() + hours * 60 * 60 * 1000);

      await api.post("/api/streams/schedule", {
        title: scheduleTitle.trim(),
        description: scheduleDesc.trim(),
        categoryId: selectedCategoryId,
        scheduledAt: scheduledDate.toISOString(),
      });

      setIsScheduleModalOpen(false);
      setScheduleTitle("");
      setScheduleDesc("");
      alert("Stream scheduled successfully!");
    } catch (e: any) {
      console.warn("Failed to schedule stream:", e);
      alert(e.response?.data?.error || "Failed to schedule stream.");
    } finally {
      setIsScheduling(false);
    }
  };

  const formatPastDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  const formatStreamDuration = (startIso: string, endIso: string | null) => {
    if (!endIso) return "0m";
    const diff = new Date(endIso).getTime() - new Date(startIso).getTime();
    const mins = Math.floor(diff / (60 * 1000));
    if (mins >= 60) {
      return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    return `${mins}m`;
  };

  const cleanFirstName = identity?.displayName 
    ? identity.displayName.split(" ")[0]
    : "Creator";

  return (
    <View style={styles.container}>
      <ScrollView
        ref={mainScrollRef}
        style={styles.scrollList}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header Block */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>Creator Studio</Text>
            <Text style={styles.headerTitle}>Welcome back, {cleanFirstName} 🎙️</Text>
          </View>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {identity?.displayName ? identity.displayName[0].toUpperCase() : "C"}
            </Text>
          </View>
        </View>

        {/* Stats Row Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroll}
          contentContainerStyle={styles.statsScrollContent}
        >
          {/* Card 1: Followers */}
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <View style={styles.statsIconCircle}>
                <Text style={styles.statsIcon}>👥</Text>
              </View>
              <Text style={styles.statsGrowPercent}>{stats.followersTrend}</Text>
            </View>
            <Text style={styles.statsValue}>{stats.followers}</Text>
            <Text style={styles.statsLabel}>Followers</Text>
          </View>

          {/* Card 2: Total Views */}
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <View style={styles.statsIconCircle}>
                <Text style={styles.statsIcon}>👁</Text>
              </View>
              <Text style={styles.statsGrowPercent}>{stats.viewsTrend}</Text>
            </View>
            <Text style={styles.statsValue}>
              {parseFloat(stats.totalViewers) > 1000 ? `${(parseFloat(stats.totalViewers)/1000).toFixed(1)}k` : stats.totalViewers}
            </Text>
            <Text style={styles.statsLabel}>Total Views</Text>
          </View>

          {/* Card 3: Total Streams */}
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <View style={styles.statsIconCircle}>
                <Text style={styles.statsIcon}>🎬</Text>
              </View>
              <Text style={styles.statsGrowPercent}>{stats.streamsTrend}</Text>
            </View>
            <Text style={styles.statsValue}>{stats.streamCount}</Text>
            <Text style={styles.statsLabel}>Streams</Text>
          </View>
        </ScrollView>

        {/* Start Broadcasting Row */}
        <TouchableOpacity style={styles.liveBroadcastingRow} onPress={onStartBroadcast}>
          <View style={styles.broadcastingLeft}>
            <View style={styles.broadcastingIconCircle}>
              <Text style={styles.broadcastingIcon}>((o))</Text>
            </View>
            <View>
              <Text style={styles.broadcastingTitle}>Start Broadcasting</Text>
              <Text style={styles.broadcastingSubtitle}>Your audience is ready for you</Text>
            </View>
          </View>
          <View style={styles.arrowCircle}>
            <Text style={styles.arrowIcon}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Automations n8n row banner */}
        <TouchableOpacity style={styles.automationsRow} onPress={onNavigateToAutomations}>
          <View style={styles.automationsLeft}>
            <View style={styles.automationsIconCircle}>
              <Text style={styles.automationsIcon}>🥞</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.autoTitleRow}>
                <Text style={styles.automationsTitle}>Automations</Text>
                <View style={styles.autoBadge}>
                  <Text style={styles.autoBadgeText}>n8n</Text>
                </View>
                <Text style={styles.autoActiveDot}>• {automationSummary.activeCount} active</Text>
              </View>
              <Text style={styles.automationsSubtitle} numberOfLines={1}>
                {automationSummary.totalCount} workflows · {automationSummary.runsCount} runs today · {automationSummary.errorCount} error
              </Text>
            </View>
          </View>
          <Text style={styles.chevronRight}>›</Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => setIsScheduleModalOpen(true)}
          >
            <Text style={styles.actionIcon}>📅</Text>
            <Text style={styles.actionLabel}>Schedule Stream</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => setIsAnalyticsModalOpen(true)}
          >
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionLabel}>View Analytics</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => {
              setIsFollowersModalOpen(true);
              loadFollowersData();
            }}
          >
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionLabel}>Manage Followers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionCard}
            onPress={() => mainScrollRef.current?.scrollToEnd({ animated: true })}
          >
            <Text style={styles.actionIcon}>🕒</Text>
            <Text style={styles.actionLabel}>Past Streams</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Streams */}
        <Text style={styles.sectionTitle}>Recent Streams</Text>
        {streams.length === 0 ? (
          <View style={styles.emptyRecentCard}>
            <Text style={styles.emptyRecentText}>No streams broadcasted yet</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {streams.map((item) => (
              <View key={item.id} style={styles.recentItem}>
                <View style={styles.recentLeft}>
                  <View style={styles.playIconCircle}>
                    <Text style={styles.playIcon}>▶</Text>
                  </View>
                  <View style={styles.recentMeta}>
                    <Text style={styles.recentTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.recentSubtext}>
                      {formatPastDate(item.startedAt)} · {item.peakViewerCount > 1000 ? `${(item.peakViewerCount / 1000).toFixed(1)}k` : item.peakViewerCount} views · {formatStreamDuration(item.startedAt, item.endedAt)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.optionsBtn}>
                  <Text style={styles.optionsDots}>•••</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Schedule Stream Modal */}
      <Modal
        visible={isScheduleModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsScheduleModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Stream</Text>
              <TouchableOpacity onPress={() => setIsScheduleModalOpen(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Stream Title */}
              <Text style={styles.inputLabel}>Stream Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Sunset sessions, coding sprint..."
                placeholderTextColor={Theme.colors.textMuted}
                value={scheduleTitle}
                onChangeText={setScheduleTitle}
              />

              {/* Description */}
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Tell your viewers what your broadcast is about..."
                placeholderTextColor={Theme.colors.textMuted}
                multiline={true}
                numberOfLines={3}
                value={scheduleDesc}
                onChangeText={setScheduleDesc}
              />

              {/* Category selector */}
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryPickerRow}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryModalPill,
                      selectedCategoryId === cat.id && styles.categoryModalPillActive,
                    ]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  >
                    <Text
                      style={[
                        styles.categoryModalLabel,
                        selectedCategoryId === cat.id && styles.categoryModalLabelActive,
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Scheduled Time Offset */}
              <Text style={styles.inputLabel}>When to Stream (Hours from now)</Text>
              <View style={styles.offsetRow}>
                {["1", "2", "4", "8", "24"].map((off) => (
                  <TouchableOpacity
                    key={off}
                    style={[
                      styles.offsetBtn,
                      scheduleTimeOffset === off && styles.offsetBtnActive,
                    ]}
                    onPress={() => setScheduleTimeOffset(off)}
                  >
                    <Text
                      style={[
                        styles.offsetBtnText,
                        scheduleTimeOffset === off && styles.offsetBtnTextActive,
                      ]}
                    >
                      +{off}h
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Submit button */}
              <TouchableOpacity
                style={[styles.submitScheduleBtn, isScheduling && styles.submitBtnDisabled]}
                onPress={handleCreateSchedule}
                disabled={isScheduling}
              >
                {isScheduling ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitScheduleBtnText}>Schedule Event</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Analytics Modal */}
      <Modal
        visible={isAnalyticsModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAnalyticsModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Channel Analytics</Text>
              <TouchableOpacity onPress={() => setIsAnalyticsModalOpen(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.analyticsStatsGrid}>
                <View style={styles.analyticsStatBox}>
                  <Text style={styles.analyticsStatValue}>{stats.followers}</Text>
                  <Text style={styles.analyticsStatLabel}>Total Followers</Text>
                  <Text style={styles.analyticsStatSub}>{stats.followersTrend} growth</Text>
                </View>
                <View style={styles.analyticsStatBox}>
                  <Text style={styles.analyticsStatValue}>{stats.totalViewers}</Text>
                  <Text style={styles.analyticsStatLabel}>Total Views</Text>
                  <Text style={styles.analyticsStatSub}>{stats.viewsTrend} views</Text>
                </View>
                <View style={styles.analyticsStatBox}>
                  <Text style={styles.analyticsStatValue}>{stats.streamCount}</Text>
                  <Text style={styles.analyticsStatLabel}>Broadcasts</Text>
                  <Text style={styles.analyticsStatSub}>{stats.streamsTrend} this week</Text>
                </View>
                <View style={styles.analyticsStatBox}>
                  <Text style={styles.analyticsStatValue}>{stats.watchTime}</Text>
                  <Text style={styles.analyticsStatLabel}>Hours Watched</Text>
                  <Text style={styles.analyticsStatSub}>Accumulated</Text>
                </View>
              </View>

              {/* Dynamic Chart Simulator */}
              <Text style={styles.chartTitle}>Viewer Peaks (Last Streams)</Text>
              {streams.length === 0 ? (
                <Text style={styles.emptyChartText}>No stream data available</Text>
              ) : (
                <View style={styles.chartContainer}>
                  {streams.slice(0, 5).reverse().map((s) => {
                    const maxVal = Math.max(...streams.map(item => item.peakViewerCount), 5);
                    const barHeight = Math.max(15, Math.min(100, (s.peakViewerCount / maxVal) * 100));
                    return (
                      <View key={s.id} style={styles.chartBarCol}>
                        <Text style={styles.barValText}>{s.peakViewerCount}</Text>
                        <View style={[styles.chartBar, { height: barHeight }]} />
                        <Text style={styles.barLabelText} numberOfLines={1}>
                          {formatPastDate(s.startedAt)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Followers Modal */}
      <Modal
        visible={isFollowersModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsFollowersModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Community</Text>
              <TouchableOpacity onPress={() => setIsFollowersModalOpen(false)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Sub-tabs */}
            <View style={styles.subTabsRow}>
              <TouchableOpacity
                style={[styles.subTabBtn, followersActiveTab === "followers" && styles.subTabBtnActive]}
                onPress={() => setFollowersActiveTab("followers")}
              >
                <Text style={[styles.subTabText, followersActiveTab === "followers" && styles.subTabTextActive]}>
                  Followers ({followersList.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.subTabBtn, followersActiveTab === "following" && styles.subTabBtnActive]}
                onPress={() => setFollowersActiveTab("following")}
              >
                <Text style={[styles.subTabText, followersActiveTab === "following" && styles.subTabTextActive]}>
                  Following ({followingList.length})
                </Text>
              </TouchableOpacity>
            </View>

            {followersLoading ? (
              <ActivityIndicator size="large" color={Theme.colors.primary} style={{ margin: 40 }} />
            ) : (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {followersActiveTab === "followers" ? (
                  followersList.length === 0 ? (
                    <Text style={styles.emptyModalListText}>No followers yet.</Text>
                  ) : (
                    followersList.map((item) => (
                      <View key={item.id} style={styles.userRowItem}>
                        <View style={styles.userRowAvatar}>
                          <Text style={styles.userRowAvatarText}>{item.displayName[0].toUpperCase()}</Text>
                        </View>
                        <View>
                          <Text style={styles.userRowName}>{item.displayName}</Text>
                          <Text style={styles.userRowHandle}>@{item.displayName.toLowerCase().replace(/[^a-z0-9]/g, "")}</Text>
                        </View>
                      </View>
                    ))
                  )
                ) : (
                  followingList.length === 0 ? (
                    <Text style={styles.emptyModalListText}>You are not following anyone.</Text>
                  ) : (
                    followingList.map((item) => (
                      <View key={item.id} style={styles.userRowItem}>
                        <View style={styles.userRowAvatar}>
                          <Text style={styles.userRowAvatarText}>{item.displayName[0].toUpperCase()}</Text>
                        </View>
                        <View>
                          <Text style={styles.userRowName}>{item.displayName}</Text>
                          <Text style={styles.userRowHandle}>@{item.displayName.toLowerCase().replace(/[^a-z0-9]/g, "")}</Text>
                        </View>
                      </View>
                    ))
                  )
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginTop: 4,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F5F0E8",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.primary,
  },
  statsScroll: {
    marginBottom: 24,
  },
  statsScrollContent: {
    paddingRight: 10,
  },
  statsCard: {
    width: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 16,
    marginRight: 12,
  },
  statsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statsIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F5F0E8",
    alignItems: "center",
    justifyContent: "center",
  },
  statsIcon: {
    fontSize: 14,
  },
  statsGrowPercent: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#34C759", // green positive text
  },
  statsValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  statsLabel: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 4,
    fontWeight: "500",
  },
  liveBroadcastingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1F2024", // Premium dark background
    borderRadius: Theme.roundness.large,
    padding: 18,
    marginBottom: 14,
  },
  broadcastingLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  broadcastingIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 99, 71, 0.15)", // faint red/orange background
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  broadcastingIcon: {
    fontSize: 18,
    color: "#FF5E3A", // warm broadcasting orange
  },
  broadcastingTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  broadcastingSubtitle: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 4,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowIcon: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  automationsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF2F2", // pale warm rose/pink background
    borderWidth: 1,
    borderColor: "#FFE0E0",
    borderRadius: Theme.roundness.large,
    padding: 16,
    marginBottom: 24,
  },
  automationsLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  automationsIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FCE8E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  automationsIcon: {
    fontSize: 18,
  },
  autoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  automationsTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#A82E2E",
  },
  autoBadge: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 0.5,
    borderColor: "#EBD1D1",
    marginLeft: 6,
  },
  autoBadgeText: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#C25C5C",
  },
  autoActiveDot: {
    fontSize: 11,
    color: "#34C759",
    fontWeight: "bold",
    marginLeft: 8,
  },
  automationsSubtitle: {
    fontSize: 11,
    color: "#C25C5C",
    marginTop: 4,
  },
  chevronRight: {
    fontSize: 22,
    color: "#C25C5C",
    fontWeight: "bold",
    paddingLeft: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 16,
    marginTop: 8,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  quickActionCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 16,
    marginBottom: 14,
    alignItems: "flex-start",
  },
  actionIcon: {
    fontSize: 22,
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  emptyRecentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  emptyRecentText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
  },
  recentList: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  recentItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: Theme.colors.border,
  },
  recentLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  playIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F5F0E8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  playIcon: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    marginLeft: 2, // offset alignment
  },
  recentMeta: {
    flex: 1,
    paddingRight: 8,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  recentSubtext: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 4,
    fontWeight: "500",
  },
  optionsBtn: {
    padding: 4,
  },
  optionsDots: {
    color: Theme.colors.textMuted,
    fontSize: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  closeBtnText: {
    fontSize: 20,
    color: Theme.colors.textMuted,
    padding: 4,
  },
  modalScroll: {
    flex: 0,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: "#F5F5F5",
    borderRadius: Theme.roundness.medium,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 15,
    color: Theme.colors.text,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  textArea: {
    height: 90,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  categoryPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  categoryModalPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#F5F5F5",
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  categoryModalPillActive: {
    backgroundColor: "#1F2024",
    borderColor: "#1F2024",
  },
  categoryModalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.colors.text,
  },
  categoryModalLabelActive: {
    color: "#FFFFFF",
  },
  offsetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  offsetBtn: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#EAEAEA",
  },
  offsetBtnActive: {
    backgroundColor: "#1F2024",
    borderColor: "#1F2024",
  },
  offsetBtnText: {
    fontSize: 13,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  offsetBtnTextActive: {
    color: "#FFFFFF",
  },
  submitScheduleBtn: {
    backgroundColor: "#6B8E78",
    borderRadius: Theme.roundness.medium,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitScheduleBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  analyticsStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  analyticsStatBox: {
    width: "48%",
    backgroundColor: "#F8F8F8",
    borderRadius: Theme.roundness.medium,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#EEEEEE",
  },
  analyticsStatValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  analyticsStatLabel: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 4,
  },
  analyticsStatSub: {
    fontSize: 10,
    color: "#6B8E78",
    fontWeight: "bold",
    marginTop: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 12,
  },
  emptyChartText: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    textAlign: "center",
    marginVertical: 20,
  },
  chartContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    height: 140,
    backgroundColor: "#F9F9F9",
    borderRadius: Theme.roundness.medium,
    padding: 14,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    marginBottom: 20,
  },
  chartBarCol: {
    alignItems: "center",
    flex: 1,
  },
  barValText: {
    fontSize: 10,
    color: Theme.colors.text,
    fontWeight: "600",
    marginBottom: 4,
  },
  chartBar: {
    width: 20,
    backgroundColor: "#7DAB8B",
    borderRadius: 4,
  },
  barLabelText: {
    fontSize: 9,
    color: Theme.colors.textMuted,
    marginTop: 6,
  },
  subTabsRow: {
    flexDirection: "row",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  subTabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#1F2024",
  },
  subTabText: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    fontWeight: "600",
  },
  subTabTextActive: {
    color: "#1F2024",
    fontWeight: "bold",
  },
  emptyModalListText: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    textAlign: "center",
    marginTop: 40,
  },
  userRowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F5F5F5",
  },
  userRowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EADCC9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userRowAvatarText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#7E6E5B",
  },
  userRowName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.text,
  },
  userRowHandle: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
});
