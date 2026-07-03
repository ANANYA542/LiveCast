import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

interface UserProfile {
  id: string;
  displayName: string;
}

export default function ProfileScreen() {
  const { identity, logout } = useAuthStore();
  const [activeSegment, setActiveSegment] = useState<"followers" | "following">("followers");
  const [followers, setFollowers] = useState<UserProfile[]>([]);
  const [following, setFollowing] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchFollowers(), fetchFollowing()]);
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchFollowers(), fetchFollowing()]);
    setRefreshing(false);
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

  const activeList = activeSegment === "followers" ? followers : following;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarTextLarge}>
              {identity?.displayName ? identity.displayName[0].toUpperCase() : "V"}
            </Text>
          </View>
          <Text style={styles.displayName}>{identity?.displayName} 👋</Text>
          <Text style={styles.handleText}>
            @{identity?.displayName ? identity.displayName.toLowerCase().replace(/[^a-z0-9]/g, "") : "user"}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.uuidLabel}>Persisted Client ID:</Text>
          <Text style={styles.uuidText}>{identity?.id}</Text>
        </View>

        {/* Segmented Control Header */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[
              styles.segmentButton,
              activeSegment === "followers" && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveSegment("followers")}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === "followers" && styles.segmentTextActive,
              ]}
            >
              Followers ({followers.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentButton,
              activeSegment === "following" && styles.segmentButtonActive,
            ]}
            onPress={() => setActiveSegment("following")}
          >
            <Text
              style={[
                styles.segmentText,
                activeSegment === "following" && styles.segmentTextActive,
              ]}
            >
              Following ({following.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content list */}
        {loading ? (
          <ActivityIndicator size="small" color={Theme.colors.primary} style={{ marginTop: 20 }} />
        ) : activeList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {activeSegment === "followers"
                ? "You don't have any followers yet."
                : "You aren't following anyone yet."}
            </Text>
          </View>
        ) : (
          <View style={styles.userList}>
            {activeList.map((item) => (
              <View key={item.id} style={styles.userItem}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {item.displayName[0].toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.userName}>{item.displayName}</Text>
                  <Text style={styles.userHandle}>
                    @{item.displayName.toLowerCase().replace(/[^a-z0-9]/g, "")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Reset Account Button */}
        <TouchableOpacity style={styles.resetButton} onPress={logout}>
          <Text style={styles.resetButtonText}>Reset Profile Account</Text>
        </TouchableOpacity>
      </ScrollView>
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
  profileCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Theme.colors.surface,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarTextLarge: {
    fontSize: 32,
    fontWeight: "bold",
    color: Theme.colors.primary,
  },
  displayName: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 4,
  },
  handleText: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    fontWeight: "500",
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: Theme.colors.border,
    marginVertical: 16,
  },
  uuidLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: Theme.colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  uuidText: {
    fontSize: 12,
    fontFamily: "monospace",
    color: Theme.colors.text,
  },
  segmentContainer: {
    flexDirection: "row",
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 4,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Theme.roundness.small,
  },
  segmentButtonActive: {
    backgroundColor: Theme.colors.primary,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.text,
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  emptyCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.colors.border,
    padding: 30,
    alignItems: "center",
    marginBottom: 24,
  },
  emptyText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  userList: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  userItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userAvatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  userName: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  userHandle: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  resetButton: {
    paddingVertical: 16,
    borderRadius: Theme.roundness.medium,
    backgroundColor: "#FDF2F2",
    borderWidth: 1,
    borderColor: "#F35B5B",
    alignItems: "center",
    justifyContent: "center",
  },
  resetButtonText: {
    color: "#D32F2F",
    fontSize: 15,
    fontWeight: "bold",
  },
});
