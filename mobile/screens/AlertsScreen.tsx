import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  createdAt: string;
}

export default function AlertsScreen() {
  const { identity } = useAuthStore();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [queuedActionsCount, setQueuedActionsCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await api.get("/api/notifications");
      setNotifications(response.data);
      setIsOffline(false);
      
      // If we successfully loaded, check if we have pending syncs
      if (queuedActionsCount > 0) {
        await syncPendingActions();
      }
    } catch (e: any) {
      console.warn("Failed to fetch notifications:", e);
      // Detect offline network state
      if (!e.response || e.message === "Network Error") {
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const syncPendingActions = async () => {
    try {
      await api.post("/api/notifications/read-all");
      setQueuedActionsCount(0);
    } catch (e) {
      console.warn("Failed to sync offline read-all action:", e);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    // Optimistically mark all as read locally
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    if (isOffline) {
      // Queue action offline
      setQueuedActionsCount((prev) => prev + 1);
      return;
    }

    try {
      await api.post("/api/notifications/read-all");
    } catch (e: any) {
      console.warn("Failed to mark notifications read:", e);
      if (!e.response || e.message === "Network Error") {
        setIsOffline(true);
        setQueuedActionsCount((prev) => prev + 1);
      } else {
        // Revert on solid validation errors
        fetchNotifications();
      }
    }
  };

  const getNotificationEmoji = (type: string) => {
    switch (type) {
      case "viewer_milestone":
        return "🏆";
      case "stream_started":
        return "🔴";
      case "ai_digest":
        return "✨";
      case "new_follower":
        return "👋";
      case "follower_milestone":
        return "🎯";
      case "digest":
        return "📊";
      default:
        return "🔔";
    }
  };

  const formatRelativeTime = (isoString: string) => {
    const now = new Date();
    const created = new Date(isoString);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.some((n) => !n.read) && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Main List */}
      {loading && notifications.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>No notifications yet.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {notifications.map((item) => (
            <View key={item.id} style={styles.notificationCard}>
              <View style={styles.cardContent}>
                {/* Emoji Circle Avatar */}
                <View style={styles.emojiCircle}>
                  <Text style={styles.emojiText}>{getNotificationEmoji(item.type)}</Text>
                </View>

                {/* Text Content */}
                <View style={styles.textContainer}>
                  <Text style={styles.titleText}>{item.title}</Text>
                  <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
                </View>

                {/* Unread Active Dot indicator */}
                {!item.read && <View style={styles.activeDot} />}
              </View>
            </View>
          ))}

          {/* Offline Queue Indicator Banner - only visible when offline or sync queue has items */}
          {(isOffline || queuedActionsCount > 0) && (
            <View style={styles.offlineBanner}>
              <View style={styles.offlineLeft}>
                <Text style={styles.wifiIcon}>📶</Text>
                <View style={styles.offlineTextContainer}>
                  <Text style={styles.offlineTitle}>
                    {queuedActionsCount > 0 ? `${queuedActionsCount} updates queued` : "Connection Offline"}
                  </Text>
                  <Text style={styles.offlineSubtitle}>Will sync when back online</Text>
                </View>
              </View>
              <TouchableOpacity onPress={fetchNotifications} style={styles.syncCircle}>
                <Text style={styles.syncIcon}>🔄</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  markReadText: {
    color: "#6B8E78", // Premium sage-green shade
    fontWeight: "bold",
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    marginTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 16,
    color: Theme.colors.textMuted,
    textAlign: "center",
  },
  scrollList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  notificationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  emojiCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F5F0E8", // Muted light warm background
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  emojiText: {
    fontSize: 20,
  },
  textContainer: {
    flex: 1,
    paddingRight: 8,
  },
  titleText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.text,
    lineHeight: 19,
  },
  timeText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 4,
    fontWeight: "500",
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#7DAB8B", // Theme primary sage dot
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F7EFE5", // Light tan
    borderWidth: 1,
    borderColor: "#EADCC9",
    borderRadius: Theme.roundness.large,
    padding: 16,
    marginTop: 12,
    marginBottom: 32,
  },
  offlineLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  wifiIcon: {
    fontSize: 20,
    marginRight: 14,
    opacity: 0.6,
  },
  offlineTextContainer: {
    flexDirection: "column",
  },
  offlineTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#6B5A4B",
  },
  offlineSubtitle: {
    fontSize: 11,
    color: "#8B7B6B",
    marginTop: 2,
  },
  syncCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  syncIcon: {
    fontSize: 14,
    opacity: 0.6,
  },
});
