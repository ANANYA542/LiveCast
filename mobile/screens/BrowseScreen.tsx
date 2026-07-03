import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Creator {
  id: string;
  displayName: string;
  isFollowing: boolean;
  followerCount: number;
  streamCount: number;
  isLive: boolean;
}

interface LiveStream {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startedAt: string;
  creator: {
    id: string;
    displayName: string;
  };
  categoryId: string | null;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  currentViewerCount: number;
}

export default function BrowseScreen({
  onSelectStream,
}: {
  onSelectStream: (streamId: string) => void;
}) {
  const identity = useAuthStore((state) => state.identity);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recommended, setRecommended] = useState<Creator[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [streamsLoading, setStreamsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      fetchCategories(),
      fetchActiveStreams("all"),
      fetchRecommendedCreators(),
    ]);
    setLoading(false);
  };

  const fetchCategories = async () => {
    try {
      const response = await api.get("/api/streams/categories");
      setCategories([{ id: "all", name: "All", slug: "all" }, ...response.data]);
    } catch (e) {
      console.warn("Failed to load stream categories:", e);
    }
  };

  const fetchActiveStreams = async (categorySlug: string) => {
    setStreamsLoading(true);
    try {
      const url = categorySlug === "all" ? "/api/streams" : `/api/streams?category=${categorySlug}`;
      const response = await api.get(url);
      setStreams(response.data);
    } catch (e) {
      console.warn("Failed to load active streams:", e);
    } finally {
      setStreamsLoading(false);
    }
  };

  const fetchRecommendedCreators = async () => {
    try {
      const response = await api.get("/api/users/recommended");
      setRecommended(response.data);
    } catch (e) {
      console.warn("Failed to load recommended creators:", e);
    }
  };

  const handleCategorySelect = (categorySlug: string) => {
    setSelectedCategorySlug(categorySlug);
    fetchActiveStreams(categorySlug);
  };

  const handleFollowToggle = async (creatorId: string, currentlyFollowing: boolean) => {
    // Optimistic UI updates
    setRecommended((prev) =>
      prev.map((c) =>
        c.id === creatorId ? { ...c, isFollowing: !currentlyFollowing } : c
      )
    );

    try {
      if (currentlyFollowing) {
        await api.delete(`/api/users/${creatorId}/follow`);
      } else {
        await api.post(`/api/users/${creatorId}/follow`);
      }
    } catch (e) {
      console.warn("Failed to toggle follow status:", e);
      // Revert state on failure
      setRecommended((prev) =>
        prev.map((c) =>
          c.id === creatorId ? { ...c, isFollowing: currentlyFollowing } : c
        )
      );
    }
  };

  // Filter streams based on search query locally
  const filteredStreams = streams.filter((stream) =>
    stream.title.toLowerCase().includes(search.toLowerCase()) ||
    stream.creator.displayName.toLowerCase().includes(search.toLowerCase())
  );

  // Highlight the stream with the highest viewer count
  const featuredStream = filteredStreams.reduce<LiveStream | null>(
    (max, stream) =>
      !max || stream.currentViewerCount > max.currentViewerCount ? stream : max,
    null
  );

  // Other trending streams (excluding the featured one)
  const trendingStreams = filteredStreams.filter(
    (stream) => stream.id !== featuredStream?.id
  );

  const getGreeting = () => {
    const hrs = new Date().getHours();
    if (hrs < 12) return "Good morning 👋";
    if (hrs < 18) return "Good afternoon 👋";
    return "Good evening 👋";
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Welcome Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
          <Text style={styles.titleText}>Discover</Text>
        </View>
        <View style={styles.avatarRow}>
          <TouchableOpacity style={styles.bellButton}>
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {identity?.displayName ? identity.displayName[0].toUpperCase() : "V"}
            </Text>
          </View>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search streams, creators..."
          placeholderTextColor={Theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <ActivityIndicator 
          size="large" 
          color={Theme.colors.primary} 
          style={{ marginTop: 40 }} 
        />
      ) : (
        <>
          {/* Categories Horizontal Pills List */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesContainer}
            contentContainerStyle={styles.categoriesContent}
          >
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryPill,
                  selectedCategorySlug === cat.slug && styles.categoryPillActive,
                ]}
                onPress={() => handleCategorySelect(cat.slug)}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategorySlug === cat.slug && styles.categoryTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Featured Live Stream Banner */}
          <Text style={styles.sectionTitle}>Featured Live</Text>
          {streamsLoading ? (
            <ActivityIndicator size="small" color={Theme.colors.primary} style={{ margin: 20 }} />
          ) : featuredStream ? (
            <TouchableOpacity
              style={styles.featuredCard}
              onPress={() => onSelectStream(featuredStream.id)}
            >
              <View style={styles.featuredPlaceholder}>
                <View style={styles.featuredBadges}>
                  <View style={styles.liveBadge}>
                    <Text style={styles.liveBadgeText}>LIVE</Text>
                  </View>
                  <View style={styles.viewerBadge}>
                    <Text style={styles.viewerBadgeText}>
                      👁 {featuredStream.currentViewerCount}
                    </Text>
                  </View>
                </View>
                <Text style={styles.liveCastIcon}>((o))</Text>
              </View>
              <View style={styles.featuredMeta}>
                <Text style={styles.featuredCategory}>
                  {featuredStream.category?.name || "Live Broadcast"}
                </Text>
                <Text style={styles.featuredTitle}>{featuredStream.title}</Text>
                <View style={styles.creatorMeta}>
                  <View style={styles.creatorAvatar}>
                    <Text style={styles.creatorAvatarText}>
                      {featuredStream.creator.displayName[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.creatorName}>
                    {featuredStream.creator.displayName}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyFeatured}>
              <Text style={styles.emptyText}>No featured stream right now.</Text>
            </View>
          )}

          {/* Trending Live Streams Grid */}
          {!streamsLoading && trendingStreams.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Trending Live</Text>
              <View style={styles.trendingGrid}>
                {trendingStreams.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.trendingCard}
                    onPress={() => onSelectStream(item.id)}
                  >
                    <View style={styles.trendingThumb}>
                      <View style={styles.trendingBadges}>
                        <View style={styles.liveBadgeMini}>
                          <Text style={styles.liveTextMini}>LIVE</Text>
                        </View>
                        <Text style={styles.viewerTextMini}>
                          👁 {item.currentViewerCount}
                        </Text>
                      </View>
                      <Text style={styles.trendingCardIcon}>📹</Text>
                    </View>
                    <Text style={styles.trendingTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.trendingCreator}>
                      {item.creator.displayName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Recommended Creators List */}
          <Text style={styles.sectionTitle}>Recommended Creators</Text>
          {recommended.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No other creators on the platform yet.</Text>
            </View>
          ) : (
            <View style={styles.recommendedList}>
              {recommended.map((item) => (
                <View key={item.id} style={styles.recommendedItem}>
                  <View style={styles.recommendedLeft}>
                    <View style={styles.recommendedAvatar}>
                      <Text style={styles.recommendedAvatarText}>
                        {item.displayName[0].toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={styles.recommendedName}>{item.displayName}</Text>
                        {item.isLive && (
                          <View style={styles.liveIndicator}>
                            <Text style={styles.liveIndicatorText}>LIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.recommendedHandle}>
                        {item.followerCount} followers
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.followButton,
                      item.isFollowing && styles.followingButton,
                    ]}
                    onPress={() => handleFollowToggle(item.id, item.isFollowing)}
                  >
                    <Text
                      style={[
                        styles.followButtonText,
                        item.isFollowing && styles.followingButtonText,
                      ]}
                    >
                      {item.isFollowing ? "Following" : "+ Follow"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </>
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
    marginBottom: 20,
    marginTop: 10,
  },
  greetingText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.textMuted,
  },
  titleText: {
    fontSize: 28,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  bellIcon: {
    fontSize: 18,
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: 20,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Theme.colors.text,
  },
  categoriesContainer: {
    marginBottom: 20,
  },
  categoriesContent: {
    paddingRight: 10,
  },
  categoryPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginRight: 10,
  },
  categoryPillActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.text,
  },
  categoryTextActive: {
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginTop: 10,
    marginBottom: 16,
  },
  featuredCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  featuredPlaceholder: {
    height: 180,
    backgroundColor: "#D9C3B0", // Muted Beige-Pink base placeholder
    alignItems: "center",
    justifyContent: "center",
  },
  liveCastIcon: {
    fontSize: 48,
    color: "rgba(255, 255, 255, 0.4)",
  },
  featuredBadges: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
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
  },
  viewerBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Theme.roundness.small,
  },
  viewerBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },
  featuredMeta: {
    padding: 16,
  },
  featuredCategory: {
    fontSize: 12,
    color: Theme.colors.primary,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  featuredTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 12,
  },
  creatorMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  creatorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  creatorAvatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  creatorName: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.text,
  },
  emptyFeatured: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Theme.colors.border,
    marginBottom: 20,
  },
  emptyText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  trendingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  trendingCard: {
    width: "48%",
    marginBottom: 20,
  },
  trendingThumb: {
    height: 110,
    backgroundColor: "#BDD1C5", // Muted Sage-Green base placeholder
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    overflow: "hidden",
  },
  trendingCardIcon: {
    fontSize: 28,
    color: "rgba(255, 255, 255, 0.4)",
  },
  trendingBadges: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  liveBadgeMini: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveTextMini: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
  viewerTextMini: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  trendingTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 2,
  },
  trendingCreator: {
    fontSize: 12,
    color: Theme.colors.textMuted,
  },
  emptyCard: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  recommendedList: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  recommendedItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  recommendedLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  recommendedAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  recommendedAvatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  recommendedName: {
    fontSize: 15,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  recommendedHandle: {
    fontSize: 12,
    color: Theme.colors.textMuted,
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
  liveIndicator: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  liveIndicatorText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
});
