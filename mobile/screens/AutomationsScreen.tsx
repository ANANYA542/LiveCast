import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  RefreshControl,
} from "react-native";
import { api } from "../services/api";
import { Theme } from "../constants/Theme";

interface Workflow {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  lastRun: string;
  runsToday: number;
}

interface ConnectionInfo {
  service: string;
  host: string;
  version: string;
  status: string;
}

interface Stats {
  activeWorkflows: number;
  totalWorkflows: number;
  runsToday: number;
  errors: number;
}

export default function AutomationsScreen({
  onGoBack,
}: {
  onGoBack: () => void;
}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "paused" | "failed">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAutomations();
  }, []);

  const fetchAutomations = async () => {
    try {
      const response = await api.get("/api/automations");
      setWorkflows(response.data.workflows);
      setConnection(response.data.connection);
      setStats(response.data.stats);
    } catch (e) {
      console.warn("Failed to fetch automations:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAutomations();
  };

  const handleToggleSwitch = async (id: string, currentStatus: string) => {
    // Optimistic local state update
    const nextStatus = currentStatus === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: nextStatus } : w))
    );

    // Update stats active workflows count optimistically
    if (stats) {
      const diff = nextStatus === "ACTIVE" ? 1 : -1;
      setStats({
        ...stats,
        activeWorkflows: stats.activeWorkflows + diff,
      });
    }

    try {
      await api.post(`/api/automations/${id}/toggle`);
    } catch (e) {
      console.warn("Failed to toggle automation workflow:", e);
      // Revert on failure
      fetchAutomations();
    }
  };

  const getWorkflowIcon = (type: string, name: string) => {
    if (name.includes("Social Blast") || name.includes("Started")) return "🎙️";
    if (name.includes("Follower")) return "👥";
    if (name.includes("Milestone")) return "🎖️";
    if (name.includes("Ended") || name.includes("AI")) return "✨";
    if (name.includes("Moderation")) return "🛡️";
    if (name.includes("Reminder")) return "📅";
    return "⚙️";
  };

  const getFilteredWorkflows = () => {
    switch (activeTab) {
      case "active":
        return workflows.filter((w) => w.status === "ACTIVE");
      case "paused":
        return workflows.filter((w) => w.status === "PAUSED");
      case "failed":
        return workflows.filter((w) => w.status === "FAILED");
      default:
        return workflows;
    }
  };

  const filteredList = getFilteredWorkflows();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={onGoBack}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.titleText}>Automations</Text>
              <View style={styles.n8nBadge}>
                <Text style={styles.n8nBadgeText}>n8n</Text>
              </View>
            </View>
            <Text style={styles.subtitleText}>Workflow automation engine</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {/* Header Stats row */}
          {stats && (
            <View style={styles.statsRow}>
              <View style={styles.statsCol}>
                <Text style={styles.statsNumber}>
                  {stats.activeWorkflows}/{stats.totalWorkflows}
                </Text>
                <Text style={styles.statsLabel}>Active</Text>
              </View>
              <View style={styles.statsCol}>
                <Text style={styles.statsNumber}>{stats.runsToday}</Text>
                <Text style={styles.statsLabel}>Runs Today</Text>
              </View>
              <View style={styles.statsCol}>
                <Text style={[styles.statsNumber, stats.errors > 0 && styles.statsNumberError]}>
                  {stats.errors}
                </Text>
                <Text style={styles.statsLabel}>Errors</Text>
              </View>
            </View>
          )}

          {/* Connection Card */}
          {connection && (
            <View style={styles.connectionCard}>
              <View style={styles.connectionLeft}>
                <View style={styles.connectionIconCircle}>
                  <Text style={styles.connectionIconEmoji}>🥞</Text>
                </View>
                <View>
                  <Text style={styles.connectionTitle}>{connection.service} · Connected</Text>
                  <Text style={styles.connectionHost}>
                    {connection.host} · {connection.version}
                  </Text>
                </View>
              </View>
              <View style={styles.liveBadgeRow}>
                <View style={styles.greenDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            </View>
          )}

          {/* Filter Tabs */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "all" && styles.tabButtonActive]}
              onPress={() => setActiveTab("all")}
            >
              <Text style={[styles.tabText, activeTab === "all" && styles.tabTextActive]}>
                All
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === "active" && styles.tabButtonActive]}
              onPress={() => setActiveTab("active")}
            >
              <Text style={[styles.tabText, activeTab === "active" && styles.tabTextActive]}>
                Active
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === "paused" && styles.tabButtonActive]}
              onPress={() => setActiveTab("paused")}
            >
              <Text style={[styles.tabText, activeTab === "paused" && styles.tabTextActive]}>
                Paused
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === "failed" && styles.tabButtonActive]}
              onPress={() => setActiveTab("failed")}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[styles.tabText, activeTab === "failed" && styles.tabTextActive]}>
                  Failed
                </Text>
                {stats && stats.errors > 0 && (
                  <View style={styles.tabBadgeError}>
                    <Text style={styles.tabBadgeErrorText}>{stats.errors}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Workflows List */}
          {filteredList.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyCardText}>No workflows in this category.</Text>
            </View>
          ) : (
            filteredList.map((item) => (
              <View key={item.id} style={styles.workflowCard}>
                <View style={styles.workflowLeft}>
                  {/* Icon Circle */}
                  <View style={styles.workflowIconCircle}>
                    <Text style={styles.workflowIconEmoji}>
                      {getWorkflowIcon(item.type, item.name)}
                    </Text>
                  </View>

                  {/* Details */}
                  <View style={styles.workflowMeta}>
                    <Text style={styles.workflowName}>{item.name}</Text>
                    <Text style={styles.workflowDesc} numberOfLines={2}>
                      {item.description}
                    </Text>

                    {/* Badge Chips Row */}
                    <View style={styles.badgeRow}>
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>
                          {item.type === "Webhook" ? "⚡ Webhook" : item.type === "Event" ? "🔔 Event" : item.type === "Condition" ? "🎛️ Condition" : "📅 Schedule"}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.chip,
                          item.status === "ACTIVE" ? styles.chipActive : item.status === "FAILED" ? styles.chipFailed : styles.chipPaused,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            item.status === "ACTIVE" ? styles.chipTextActive : item.status === "FAILED" ? styles.chipTextFailed : styles.chipTextPaused,
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{item.lastRun}</Text>
                      </View>
                      <View style={styles.chip}>
                        <Text style={styles.chipText}>{item.runsToday} today</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Status Switch */}
                <Switch
                  value={item.status === "ACTIVE"}
                  onValueChange={() => handleToggleSwitch(item.id, item.status)}
                  trackColor={{ false: "#D1CDCA", true: "#87B393" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ))
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
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  backButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleText: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  n8nBadge: {
    backgroundColor: "#FDF2F2",
    borderWidth: 1,
    borderColor: "#F35B5B",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  n8nBadgeText: {
    color: "#D32F2F",
    fontSize: 10,
    fontWeight: "bold",
  },
  subtitleText: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 2,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    fontSize: 20,
    color: Theme.colors.text,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: 16,
    marginBottom: 20,
  },
  statsCol: {
    flex: 1,
    alignItems: "center",
  },
  statsNumber: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  statsNumberError: {
    color: "#D32F2F",
  },
  statsLabel: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 4,
    fontWeight: "500",
  },
  connectionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF2F2", // soft pink/red connection badge background
    borderWidth: 1,
    borderColor: "#FFE0E0",
    borderRadius: Theme.roundness.large,
    padding: 16,
    marginBottom: 20,
  },
  connectionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  connectionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FCE8E6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  connectionIconEmoji: {
    fontSize: 16,
  },
  connectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#A82E2E",
  },
  connectionHost: {
    fontSize: 11,
    color: "#C25C5C",
    marginTop: 2,
  },
  liveBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: "#EBD1D1",
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#34C759",
    marginRight: 6,
  },
  liveText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#34C759",
  },
  tabsRow: {
    flexDirection: "row",
    marginBottom: 20,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginRight: 8,
  },
  tabButtonActive: {
    backgroundColor: "#1F2024",
    borderColor: "#1F2024",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.colors.text,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  tabBadgeError: {
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
    paddingHorizontal: 3,
  },
  tabBadgeErrorText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
  workflowCard: {
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
  workflowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  workflowIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F0E8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  workflowIconEmoji: {
    fontSize: 18,
  },
  workflowMeta: {
    flex: 1,
    paddingRight: 10,
  },
  workflowName: {
    fontSize: 15,
    fontWeight: "bold",
    color: Theme.colors.text,
  },
  workflowDesc: {
    fontSize: 12,
    color: Theme.colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  chip: {
    backgroundColor: "#F5F0E8",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 4,
  },
  chipActive: {
    backgroundColor: "#E2F0D9",
  },
  chipPaused: {
    backgroundColor: "#ECEAE6",
  },
  chipFailed: {
    backgroundColor: "#FCE8E6",
  },
  chipText: {
    fontSize: 10,
    color: Theme.colors.textSecondary,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#385623",
  },
  chipTextPaused: {
    color: "#7F7F7F",
  },
  chipTextFailed: {
    color: "#C55A11",
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.medium,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  emptyCardText: {
    color: Theme.colors.textMuted,
    fontSize: 14,
  },
});
