import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

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
}: {
  onStartBroadcast: () => void;
}) {
  const identity = useAuthStore((state) => state.identity);
  const [streams, setStreams] = useState<PastStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalViewers: "0",
    followers: "0",
    watchTime: "0h",
    streamCount: "0",
  });

  // Fetch past broadcasts on focus/mount
  useEffect(() => {
    fetchUserStreams();
  }, []);

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
      });
    } catch (e) {
      console.warn("Failed to load user streams:", e);
    } finally {
      setLoading(false);
    }
  };

  const cleanHandle = identity
    ? `@${identity.displayName.toLowerCase().replace(/[^a-z0-9]/g, "")}`
    : "@creator";

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>Creator Studio</Text>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </View>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {identity?.displayName ? identity.displayName[0].toUpperCase() : "C"}
          </Text>
        </View>
      </View>

      {/* Your Channel Banner */}
      <View style={styles.channelCard}>
        <View style={styles.channelInfo}>
          <View style={styles.channelAvatar}>
            <Text style={styles.channelAvatarText}>
              {identity?.displayName ? identity.displayName[0].toUpperCase() : "C"}
            </Text>
          </View>
          <View style={styles.channelMeta}>
            <Text style={styles.channelName}>{identity?.displayName}</Text>
            <Text style={styles.channelHandle}>{cleanHandle}</Text>
            <Text style={styles.channelSubscribers}>
              {stats.followers} followers • {stats.totalViewers} views
            </Text>
          </View>
        </View>
      </View>

      {/* Primary Go Live Call to Action */}
      <TouchableOpacity style={styles.broadcastButton} onPress={onStartBroadcast}>
        <Text style={styles.broadcastButtonText}>🎥 Start Live Broadcast</Text>
      </TouchableOpacity>

      {/* Statistics Block */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>This Week</Text>
        <TouchableOpacity onPress={fetchUserStreams}>
          <Text style={styles.refreshLink}>Refresh stats</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        {/* Card 1: Viewers */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsIcon}>👁</Text>
            <Text style={styles.statsTrendSage}>All-Time</Text>
          </View>
          <Text style={styles.statsValue}>{stats.totalViewers}</Text>
          <Text style={styles.statsLabel}>Total Viewers</Text>
        </View>

        {/* Card 2: Followers */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsIcon}>👥</Text>
            <Text style={styles.statsTrendGreen}>Followers</Text>
          </View>
          <Text style={styles.statsValue}>{stats.followers}</Text>
          <Text style={styles.statsLabel}>Total Followers</Text>
        </View>

        {/* Card 3: Watch Time */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsIcon}>⏱</Text>
            <Text style={styles.statsTrendSage}>Hours</Text>
          </View>
          <Text style={styles.statsValue}>{stats.watchTime}</Text>
          <Text style={styles.statsLabel}>Watch Time</Text>
        </View>

        {/* Card 4: Stream Count */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsIcon}>🎬</Text>
            <Text style={styles.statsTrendSage}>Streams</Text>
          </View>
          <Text style={styles.statsValue}>{stats.streamCount}</Text>
          <Text style={styles.statsLabel}>Total Streams</Text>
        </View>
      </View>

      {/* Recent Broadcasts List */}
      <Text style={styles.sectionTitleList}>Recent Broadcasts</Text>

      {loading ? (
        <ActivityIndicator
          size="small"
          color={Theme.colors.primary}
          style={{ marginTop: 20 }}
        />
      ) : streams.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No streams broadcasted yet.</Text>
          <Text style={styles.emptyStateSubtext}>
            Tap "Start Live Broadcast" above to stream your first video!
          </Text>
        </View>
      ) : (
        <View style={styles.broadcastList}>
          {streams.map((item) => (
            <View key={item.id} style={styles.broadcastItem}>
              <View style={styles.broadcastIconBg}>
                <Text style={styles.broadcastIconText}>📹</Text>
              </View>
              <View style={styles.broadcastMeta}>
                <Text style={styles.broadcastTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.broadcastSub}>
                  {item.category?.name ? `${item.category.name} · ` : ""}{item.peakViewerCount} peak viewers · {formatDate(item.startedAt)}
                </Text>
              </View>
              <View
                style={[
                  styles.statusIndicator,
                  item.endedAt ? styles.statusEnded : styles.statusLive,
                ]}
              >
                <Text style={styles.statusIndicatorText}>
                  {item.endedAt ? "Ended" : "Live"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  contentContainer: {
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
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.textMuted,
    textTransform: "uppercase",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.primary,
  },
  channelCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  channelInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  channelAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  channelAvatarText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  channelMeta: {
    marginLeft: 16,
    flex: 1,
  },
  channelName: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  channelHandle: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    marginBottom: 4,
  },
  channelSubscribers: {
    fontSize: 13,
    color: Theme.colors.text,
    fontWeight: "500",
  },
  broadcastButton: {
    height: 56,
    backgroundColor: Theme.colors.accent,
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  broadcastButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  sectionTitleList: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginTop: 28,
    marginBottom: 16,
  },
  refreshLink: {
    fontSize: 13,
    color: Theme.colors.primary,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  statsCard: {
    width: "48%",
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  statsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  statsIcon: {
    fontSize: 20,
  },
  statsTrendGreen: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#34C759", // Positive Green
    backgroundColor: "rgba(52, 199, 89, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Theme.roundness.small,
  },
  statsTrendSage: {
    fontSize: 12,
    fontWeight: "bold",
    color: Theme.colors.primary,
    backgroundColor: "rgba(143, 188, 143, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Theme.roundness.small,
  },
  statsValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 4,
  },
  statsLabel: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    fontWeight: "500",
  },
  emptyState: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.colors.border,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: Theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
  },
  broadcastList: {
    width: "100%",
  },
  broadcastItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  broadcastIconBg: {
    width: 40,
    height: 40,
    borderRadius: Theme.roundness.small,
    backgroundColor: Theme.colors.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  broadcastIconText: {
    fontSize: 20,
  },
  broadcastMeta: {
    marginLeft: 12,
    flex: 1,
  },
  broadcastTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 2,
  },
  broadcastSub: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Theme.roundness.small,
  },
  statusEnded: {
    backgroundColor: Theme.colors.inputBg,
  },
  statusLive: {
    backgroundColor: "#FF3B30",
  },
  statusIndicatorText: {
    fontSize: 11,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
});
