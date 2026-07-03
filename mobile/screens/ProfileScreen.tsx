import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Image,
} from "react-native";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

interface UserProfile {
  id: string;
  displayName: string;
}

export default function ProfileScreen({
  onNavigateTab,
}: {
  onNavigateTab: (tab: "home" | "explore" | "studio" | "alerts" | "profile") => void;
}) {
  const { identity, logout } = useAuthStore();
  const [followers, setFollowers] = useState<UserProfile[]>([]);
  const [following, setFollowing] = useState<UserProfile[]>([]);
  const [streamCount, setStreamCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"viewer" | "creator">("viewer");
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [activeListVisible, setActiveListVisible] = useState<"none" | "followers" | "following">("none");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchFollowers(), fetchFollowing(), fetchStats()]);
    setLoading(false);
  };

  const fetchFollowers = async () => {
    try {
      const response = await api.get("/api/users/followers");
      setFollowers(response.data);
    } catch (e) {
      console.warn("Failed to fetch followers:", e);
    }
  };

  const fetchFollowing = async () => {
    try {
      const response = await api.get("/api/users/following");
      setFollowing(response.data);
    } catch (e) {
      console.warn("Failed to fetch following:", e);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get("/api/streams/user/stats");
      setStreamCount(response.data.stats.streamCount);
    } catch (e) {
      console.warn("Failed to fetch creator stats:", e);
    }
  };

  const handleToggleMode = () => {
    setMode((prev) => (prev === "viewer" ? "creator" : "viewer"));
  };

  const activeList = activeListVisible === "followers" ? followers : following;

  const handleListItemPress = (item: string) => {
    if (item === "Saved Streams" || item === "Watch History") {
      onNavigateTab("home");
    } else if (item === "Creator Statistics") {
      onNavigateTab("studio");
    } else if (item === "Manage Followers") {
      setActiveListVisible((prev) => (prev === "followers" ? "none" : "followers"));
    } else if (item === "Settings") {
      setSettingsVisible(true);
    }
  };

  const cleanHandle = identity
    ? `@${identity.displayName.toLowerCase().replace(/[^a-z0-9]/g, "")}`
    : "@user";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity
            style={styles.settingsCircle}
            onPress={() => setSettingsVisible(true)}
          >
            <Text style={styles.settingsIconText}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* User Card Info */}
        <View style={styles.userInfoRow}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarImageCircle}>
              <Text style={styles.avatarTextLarge}>
                {identity?.displayName ? identity.displayName[0].toUpperCase() : "A"}
              </Text>
            </View>
            <View style={styles.cameraOverlayCircle}>
              <Text style={styles.cameraOverlayIcon}>📷</Text>
            </View>
          </View>
          <View style={styles.userMeta}>
            <Text style={styles.displayName}>{identity?.displayName}</Text>
            <Text style={styles.handleText}>{cleanHandle}</Text>
            <Text style={styles.interestsText}>🎵 Music · 🍜 Food · ✨ Wellness</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statsCol}
            onPress={() =>
              setActiveListVisible(activeListVisible === "followers" ? "none" : "followers")
            }
          >
            <Text style={styles.statsNumber}>{followers.length}</Text>
            <Text style={styles.statsLabel}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statsCol}
            onPress={() =>
              setActiveListVisible(activeListVisible === "following" ? "none" : "following")
            }
          >
            <Text style={styles.statsNumber}>{following.length}</Text>
            <Text style={styles.statsLabel}>Following</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statsCol}
            onPress={() => onNavigateTab("studio")}
          >
            <Text style={styles.statsNumber}>{streamCount}</Text>
            <Text style={styles.statsLabel}>Streams</Text>
          </TouchableOpacity>
        </View>

        {/* Switch Mode Container */}
        <View style={styles.switchModeCard}>
          <Text style={styles.switchModeHeader}>SWITCH MODE</Text>
          <View style={styles.switchButtonsRow}>
            {/* Viewer Mode button */}
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                mode === "viewer" ? styles.modeToggleBtnActive : styles.modeToggleBtnInactive,
              ]}
              onPress={() => setMode("viewer")}
            >
              <Text style={styles.modeIcon}>📺</Text>
              <Text
                style={[
                  styles.modeBtnLabel,
                  mode === "viewer" ? styles.modeBtnLabelActive : styles.modeBtnLabelInactive,
                ]}
              >
                Viewer
              </Text>
            </TouchableOpacity>

            {/* Swap Circle */}
            <TouchableOpacity style={styles.swapCircle} onPress={handleToggleMode}>
              <Text style={styles.swapIconText}>⇆</Text>
            </TouchableOpacity>

            {/* Creator Mode button */}
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                mode === "creator" ? styles.modeToggleBtnActive : styles.modeToggleBtnInactive,
              ]}
              onPress={() => setMode("creator")}
            >
              <Text style={styles.modeIcon}>🎙️</Text>
              <Text
                style={[
                  styles.modeBtnLabel,
                  mode === "creator" ? styles.modeBtnLabelActive : styles.modeBtnLabelInactive,
                ]}
              >
                Creator
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.modeStatusText}>
            Currently in <Text style={{ fontWeight: "bold" }}>{mode === "viewer" ? "Viewer" : "Creator"} Mode</Text>
          </Text>
        </View>

        {/* Expandable Followers/Following List */}
        {activeListVisible !== "none" && (
          <View style={styles.expandedListCard}>
            <View style={styles.expandedHeaderRow}>
              <Text style={styles.expandedHeaderTitle}>
                {activeListVisible === "followers" ? "Followers" : "Following"} List
              </Text>
              <TouchableOpacity onPress={() => setActiveListVisible("none")}>
                <Text style={styles.expandedCloseBtn}>Close</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <ActivityIndicator size="small" color={Theme.colors.primary} />
            ) : activeList.length === 0 ? (
              <Text style={styles.emptyListText}>
                No users found.
              </Text>
            ) : (
              activeList.map((item) => (
                <View key={item.id} style={styles.expandedUserRow}>
                  <View style={styles.userAvatarCircle}>
                    <Text style={styles.userAvatarText}>
                      {item.displayName[0].toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.expandedUserName}>{item.displayName}</Text>
                    <Text style={styles.expandedUserHandle}>
                      @{item.displayName.toLowerCase().replace(/[^a-z0-9]/g, "")}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Profile Options List */}
        <View style={styles.optionsList}>
          {/* Creator Statistics */}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => handleListItemPress("Creator Statistics")}
          >
            <View style={styles.optionLeft}>
              <View style={styles.optionIconCircle}>
                <Text style={styles.optionIconEmoji}>📊</Text>
              </View>
              <Text style={styles.optionText}>Creator Statistics</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {/* Manage Followers */}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => handleListItemPress("Manage Followers")}
          >
            <View style={styles.optionLeft}>
              <View style={styles.optionIconCircle}>
                <Text style={styles.optionIconEmoji}>👥</Text>
              </View>
              <Text style={styles.optionText}>Manage Followers</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          {/* Settings */}
          <TouchableOpacity
            style={styles.optionItem}
            onPress={() => handleListItemPress("Settings")}
          >
            <View style={styles.optionLeft}>
              <View style={styles.optionIconCircle}>
                <Text style={styles.optionIconEmoji}>⚙️</Text>
              </View>
              <Text style={styles.optionText}>Settings</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Custom Settings Modal */}
      <Modal
        visible={settingsVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Settings</Text>
            <View style={styles.divider} />
            
            <Text style={styles.clientIdLabel}>Persisted Client ID:</Text>
            <Text style={styles.clientIdValue}>{identity?.id}</Text>
            
            <TouchableOpacity style={styles.logoutBtn} onPress={() => {
              setSettingsVisible(false);
              logout();
            }}>
              <Text style={styles.logoutBtnText}>Reset Profile / Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSettingsVisible(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
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
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  settingsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsIconText: {
    fontSize: 18,
  },
  userInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {
    position: "relative",
    marginRight: 16,
  },
  avatarImageCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#7DAB8B", // Theme primary sage
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTextLarge: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  cameraOverlayCircle: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraOverlayIcon: {
    fontSize: 12,
  },
  userMeta: {
    flex: 1,
  },
  displayName: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  handleText: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    marginVertical: 2,
    fontWeight: "500",
  },
  interestsText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: 14,
    marginBottom: 24,
  },
  statsCol: {
    flex: 1,
    alignItems: "center",
  },
  statsNumber: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.colors.text,
  },
  statsLabel: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },
  switchModeCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 20,
    marginBottom: 20,
    alignItems: "center",
  },
  switchModeHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "#8E8A85",
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  switchButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 14,
  },
  modeToggleBtn: {
    flex: 1,
    height: 80,
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  modeToggleBtnActive: {
    backgroundColor: "#87B393", // Soft sage green active
  },
  modeToggleBtnInactive: {
    backgroundColor: "#F2EDE4", // Light muted background
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  modeBtnLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  modeBtnLabelActive: {
    color: "#FFFFFF",
  },
  modeBtnLabelInactive: {
    color: "#4A4D52",
  },
  swapCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1F2024",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  swapIconText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  modeStatusText: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
    marginTop: 6,
  },
  optionsList: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F0E8",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F5F0E8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  optionIconEmoji: {
    fontSize: 16,
  },
  optionText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.colors.text,
  },
  optionRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  badgePill: {
    backgroundColor: "#EAE6DF",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 10,
  },
  badgeText: {
    fontSize: 11,
    color: "#8E8A85",
    fontWeight: "700",
  },
  chevron: {
    fontSize: 20,
    color: "#C8C5BF",
    fontWeight: "bold",
  },
  expandedListCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 16,
    marginBottom: 20,
  },
  expandedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F0E8",
    paddingBottom: 8,
  },
  expandedHeaderTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  expandedCloseBtn: {
    color: Theme.colors.primary,
    fontWeight: "bold",
  },
  emptyListText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 12,
  },
  expandedUserRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F5F0E8",
  },
  userAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#7DAB8B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userAvatarText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  expandedUserName: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  expandedUserHandle: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    padding: 24,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: Theme.colors.border,
    marginVertical: 16,
  },
  clientIdLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  clientIdValue: {
    fontSize: 13,
    fontFamily: "monospace",
    color: Theme.colors.text,
    backgroundColor: "#F5F0E8",
    padding: 8,
    borderRadius: 6,
    marginBottom: 24,
    textAlign: "center",
  },
  logoutBtn: {
    width: "100%",
    height: 50,
    backgroundColor: "#FDF2F2",
    borderWidth: 1,
    borderColor: "#F35B5B",
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoutBtnText: {
    color: "#D32F2F",
    fontSize: 15,
    fontWeight: "bold",
  },
  closeBtn: {
    width: "100%",
    height: 50,
    backgroundColor: "#F5F0E8",
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: Theme.colors.text,
    fontSize: 15,
    fontWeight: "bold",
  },
});
