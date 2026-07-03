import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from "react-native";
import { api } from "../services/api";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface LiveStream {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startedAt: string;
  scheduledAt?: string | null;
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
  reminderCount?: number;
  isReminded?: boolean;
}

export default function BrowseScreen({
  onSelectStream,
}: {
  onSelectStream: (streamId: string) => void;
}) {
  const identity = useAuthStore((state) => state.identity);
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [upcoming, setUpcoming] = useState<LiveStream[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      fetchCategories(),
      fetchActiveStreams("all"),
      fetchUpcomingStreams(),
    ]);
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchActiveStreams(selectedCategorySlug),
      fetchUpcomingStreams(),
    ]);
    setRefreshing(false);
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
    try {
      const url = categorySlug === "all" ? "/api/streams" : `/api/streams?category=${categorySlug}`;
      const response = await api.get(url);
      setStreams(response.data);
    } catch (e) {
      console.warn("Failed to load active streams:", e);
    }
  };

  const fetchUpcomingStreams = async () => {
    try {
      const response = await api.get("/api/streams/upcoming");
      setUpcoming(response.data);
    } catch (e) {
      console.warn("Failed to load upcoming streams:", e);
    }
  };

  const handleCategorySelect = (categorySlug: string) => {
    setSelectedCategorySlug(categorySlug);
    fetchActiveStreams(categorySlug);
  };

  const handleToggleReminder = async (streamId: string) => {
    // Optimistic toggle
    setUpcoming((prev) =>
      prev.map((item) => {
        if (item.id === streamId) {
          const wasReminded = item.isReminded ?? false;
          const currentCount = item.reminderCount ?? 0;
          return {
            ...item,
            isReminded: !wasReminded,
            reminderCount: wasReminded ? Math.max(0, currentCount - 1) : currentCount + 1,
          };
        }
        return item;
      })
    );

    try {
      await api.post(`/api/streams/${streamId}/remind`);
    } catch (e) {
      console.warn("Failed to toggle reminder:", e);
      fetchUpcomingStreams();
    }
  };

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

  const formatStreamDuration = (startedAtIso: string) => {
    const start = new Date(startedAtIso).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
    const diffMins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
    
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins}m`;
    }
    return `${diffMins}m`;
  };

  const formatScheduledTime = (scheduledAtIso: string) => {
    const date = new Date(scheduledAtIso);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const timeString = date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (date.toDateString() === today.toDateString()) {
      return `Tonight ${timeString}`;
    }
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow ${timeString}`;
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ` ${timeString}`;
  };

  // Filter streams based on search query locally
  const filteredStreams = streams.filter((stream) =>
    stream.title.toLowerCase().includes(search.toLowerCase()) ||
    stream.creator.displayName.toLowerCase().includes(search.toLowerCase())
  );

  // The first stream is featured (Live Right Now)
  const featuredStream = filteredStreams[0] || null;

  // The next streams are trending (Trending Now)
  const trendingStreams = filteredStreams.slice(1);

  return (
    <View style={styles.container}>
      {/* Search Input Bar (Moved inside header container but matching Figma) */}
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header Block */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingLabel}>Good morning,</Text>
            <Text style={styles.displayName}>{identity?.displayName || "Guest"} 👋</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.circleHeaderBtn}>
              <Text style={styles.headerBtnEmoji}>🔍</Text>
            </TouchableOpacity>
            <View style={styles.profileAvatarWrapper}>
              <View style={styles.profileAvatarCircle}>
                <Text style={styles.profileAvatarText}>
                  {identity?.displayName ? identity.displayName[0].toUpperCase() : "A"}
                </Text>
              </View>
              <View style={styles.greenStatusDot} />
            </View>
          </View>
        </View>

        {/* Search Input */}
        <View style={styles.searchBar}>
          <Text style={styles.searchBarIcon}>🔍</Text>
          <TextInput
            style={styles.searchBarInput}
            placeholder="Search streams, creators..."
            placeholderTextColor={Theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Category Pills Horizontal Row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoriesRow}
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
                      styles.categoryLabel,
                      selectedCategorySlug === cat.slug && styles.categoryLabelActive,
                    ]}
                  >
                    {cat.slug !== "all" && getCategoryEmoji(cat.slug) + " "}
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* LIVE RIGHT NOW SECTION (FEATURED) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>🔴 Live Right Now</Text>
            </View>

            {featuredStream ? (
              <TouchableOpacity
                style={styles.featuredCard}
                onPress={() => onSelectStream(featuredStream.id)}
              >
                {/* Background Banner */}
                <View style={styles.featuredThumbnail}>
                  <View style={styles.badgeOverlayRow}>
                    <View style={styles.liveLabelPill}>
                      <Text style={styles.liveLabelText}>🔴 LIVE</Text>
                    </View>
                    <View style={styles.viewersLabelPill}>
                      <Text style={styles.viewersLabelText}>
                        👁 {featuredStream.currentViewerCount > 1000 ? `${(featuredStream.currentViewerCount / 1000).toFixed(1)}k` : featuredStream.currentViewerCount}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Title overlay */}
                  <View style={styles.cardTitleOverlay}>
                    <Text style={styles.cardTitleText} numberOfLines={2}>
                      {featuredStream.title}
                    </Text>
                  </View>
                </View>

                {/* Footer Metadata */}
                <View style={styles.cardFooter}>
                  <View style={styles.footerCreatorInfo}>
                    <View style={styles.footerAvatar}>
                      <Text style={styles.footerAvatarText}>
                        {featuredStream.creator.displayName[0].toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.footerCreatorName}>
                      {featuredStream.creator.displayName}
                    </Text>
                  </View>
                  <Text style={styles.durationText}>
                    {formatStreamDuration(featuredStream.startedAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.emptyCardPlaceholder}>
                <Text style={styles.emptyPlaceholderText}>No streams live right now</Text>
              </View>
            )}

            {/* TRENDING NOW SECTION (GRID) */}
            {trendingStreams.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Trending Now</Text>
                  <TouchableOpacity>
                    <Text style={styles.seeAllLink}>See all ›</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.trendingGrid}>
                  {trendingStreams.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.trendingCard}
                      onPress={() => onSelectStream(item.id)}
                    >
                      <View style={styles.trendingThumb}>
                        <View style={styles.badgeOverlayRowMini}>
                          <View style={styles.liveLabelPillMini}>
                            <Text style={styles.liveLabelTextMini}>🔴 LIVE</Text>
                          </View>
                          <View style={styles.viewersLabelPillMini}>
                            <Text style={styles.viewersLabelTextMini}>
                              👁 {item.currentViewerCount > 1000 ? `${(item.currentViewerCount / 1000).toFixed(1)}k` : item.currentViewerCount}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.trendingCardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <View style={styles.trendingCreatorRow}>
                        <View style={styles.trendingCreatorAvatar}>
                          <Text style={styles.trendingCreatorAvatarText}>
                            {item.creator.displayName[0].toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.trendingCreatorName} numberOfLines={1}>
                          {item.creator.displayName}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* UPCOMING EVENTS SECTION */}
            {upcoming.length > 0 && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Upcoming Scheduled Streams</Text>
                </View>
                <View style={styles.upcomingList}>
                  {upcoming.map((item) => (
                    <View key={item.id} style={styles.upcomingCard}>
                      <View style={styles.upcomingLeft}>
                        <View style={styles.calendarIconCircle}>
                          <Text style={styles.calendarIconEmoji}>📅</Text>
                        </View>
                        <View style={styles.upcomingMeta}>
                          <Text style={styles.upcomingTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.upcomingCreatorTime}>
                            {item.creator.displayName} · {item.scheduledAt ? formatScheduledTime(item.scheduledAt) : ""}
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.remindBtn,
                          item.isReminded && styles.remindBtnActive,
                        ]}
                        onPress={() => handleToggleReminder(item.id)}
                      >
                        <Text
                          style={[
                            styles.remindBtnText,
                            item.isReminded && styles.remindBtnTextActive,
                          ]}
                        >
                          {item.isReminded ? "Reminded ✓" : "Remind"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  scrollContainer: {
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
    marginBottom: 20,
    marginTop: 10,
  },
  greetingLabel: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    fontWeight: "500",
  },
  displayName: {
    fontSize: 24,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  circleHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerBtnEmoji: {
    fontSize: 16,
  },
  profileAvatarWrapper: {
    position: "relative",
  },
  profileAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#7DAB8B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  profileAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  greenStatusDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34C759",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.medium,
    height: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: 20,
  },
  searchBarIcon: {
    fontSize: 16,
    marginRight: 12,
    color: Theme.colors.textMuted,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 16,
    color: Theme.colors.text,
  },
  categoriesRow: {
    marginBottom: 24,
  },
  categoriesContent: {
    paddingRight: 10,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginRight: 10,
  },
  categoryPillActive: {
    backgroundColor: "#1F2024",
    borderColor: "#1F2024",
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.colors.text,
  },
  categoryLabelActive: {
    color: "#FFFFFF",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  seeAllLink: {
    fontSize: 14,
    color: "#6B8E78",
    fontWeight: "bold",
  },
  featuredCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  featuredThumbnail: {
    height: 200,
    backgroundColor: "#D0C9C0", // Styled warm card placeholder
    position: "relative",
    justifyContent: "space-between",
    padding: 16,
  },
  badgeOverlayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  liveLabelPill: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  liveLabelText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },
  viewersLabelPill: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  viewersLabelText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "bold",
  },
  cardTitleOverlay: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
  },
  cardTitleText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    lineHeight: 26,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  footerCreatorInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#7DAB8B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  footerAvatarText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
  },
  footerCreatorName: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  durationText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    fontWeight: "600",
  },
  emptyCardPlaceholder: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderStyle: "dashed",
    marginBottom: 24,
  },
  emptyPlaceholderText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
  },
  trendingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  trendingCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 10,
    marginBottom: 16,
  },
  trendingThumb: {
    height: 100,
    backgroundColor: "#C3D6C9", // warm sage placeholder background
    borderRadius: Theme.roundness.medium,
    padding: 8,
    marginBottom: 8,
  },
  badgeOverlayRowMini: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  liveLabelPillMini: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveLabelTextMini: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "bold",
  },
  viewersLabelPillMini: {
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  viewersLabelTextMini: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "bold",
  },
  trendingCardTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: Theme.colors.text,
    lineHeight: 17,
    marginBottom: 8,
    height: 34, // keep constant height for alignment
  },
  trendingCreatorRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  trendingCreatorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EADCC9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  trendingCreatorAvatarText: {
    color: "#7E6E5B",
    fontSize: 9,
    fontWeight: "bold",
  },
  trendingCreatorName: {
    flex: 1,
    fontSize: 11,
    color: Theme.colors.textMuted,
    fontWeight: "500",
  },
  upcomingList: {
    marginBottom: 20,
  },
  upcomingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.large,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 16,
    marginBottom: 12,
  },
  upcomingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  calendarIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F0E8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  calendarIconEmoji: {
    fontSize: 18,
  },
  upcomingMeta: {
    flex: 1,
    paddingRight: 8,
  },
  upcomingTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  upcomingCreatorTime: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 4,
    fontWeight: "500",
  },
  remindBtn: {
    backgroundColor: "#6B8E78", // soft sage-green theme
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 70,
    alignItems: "center",
  },
  remindBtnActive: {
    backgroundColor: "#ECEAE6",
    borderWidth: 0.5,
    borderColor: "#D1CDCA",
  },
  remindBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  remindBtnTextActive: {
    color: "#7F7F7F",
  },
});
