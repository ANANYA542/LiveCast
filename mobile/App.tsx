import React, { useEffect } from "react";
import { StyleSheet, Text, View, SafeAreaView, ActivityIndicator, TouchableOpacity, Platform, LogBox } from "react-native";
import { TextEncoder, TextDecoder } from "text-encoding";
import NetInfo from "@react-native-community/netinfo";

// Suppress all developer warning popups on the screen
LogBox.ignoreAllLogs();

// Polyfill TextEncoder and TextDecoder (Mandatory for livekit-client on Hermes JS engine)
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

import { registerGlobals } from "@livekit/react-native";
import { useAuthStore } from "./stores/authStore";
import WelcomeScreen from "./screens/WelcomeScreen";
import CreatorScreen from "./screens/CreatorScreen";
import CreatorDashboardScreen from "./screens/CreatorDashboardScreen";
import BrowseScreen from "./screens/BrowseScreen";
import ViewerLiveScreen from "./screens/ViewerLiveScreen";
import ProfileScreen from "./screens/ProfileScreen";
import AlertsScreen from "./screens/AlertsScreen";
import AutomationsScreen from "./screens/AutomationsScreen";
import { api } from "./services/api";
import { Theme } from "./constants/Theme";

// Register LiveKit WebRTC Globals (Mandatory for react-native-webrtc native bridging)
registerGlobals();

type TabType = "home" | "explore" | "studio" | "alerts" | "profile";

export default function App() {
  const { identity, isChecked, checkIdentity } = useAuthStore();
  const [isBroadcasting, setIsBroadcasting] = React.useState(false);
  const [activeStreamId, setActiveStreamId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabType>("home");
  const [studioScreen, setStudioScreen] = React.useState<"dashboard" | "automations">("dashboard");
  const [unreadCount, setUnreadCount] = React.useState(0);

  const [isOfflineToastVisible, setIsOfflineToastVisible] = React.useState(false);
  const [isOnlineToastVisible, setIsOnlineToastVisible] = React.useState(false);

  // Load identity and set up connectivity toast listeners
  useEffect(() => {
    checkIdentity();

    let firstLoad = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = !!state.isConnected;
      if (firstLoad) {
        firstLoad = false;
        if (!isConnected) {
          setIsOfflineToastVisible(true);
        }
        return;
      }

      if (!isConnected) {
        setIsOnlineToastVisible(false);
        setIsOfflineToastVisible(true);
      } else {
        setIsOfflineToastVisible(false);
        setIsOnlineToastVisible(true);
        const timer = setTimeout(() => {
          setIsOnlineToastVisible(false);
        }, 3000);
        return () => clearTimeout(timer);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchUnreadNotifications = async () => {
    try {
      const response = await api.get("/api/notifications");
      const unread = response.data.filter((n: any) => !n.read).length;
      setUnreadCount(unread);
    } catch (e) {
      console.warn("Failed to fetch unread notification count:", e);
    }
  };

  useEffect(() => {
    if (identity) {
      fetchUnreadNotifications();
    }
  }, [activeTab, identity]);

  // Display a warm beige splash skeleton during initial disk reads
  if (!isChecked) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  // Route to name picker onboarding screen if new user
  if (!identity) {
    return <WelcomeScreen />;
  }

  // Route to Creator broadcast screen
  if (isBroadcasting) {
    return <CreatorScreen onGoBack={() => setIsBroadcasting(false)} />;
  }

  // Route to Viewer live watching/chat screen
  if (activeStreamId) {
    return (
      <ViewerLiveScreen
        streamId={activeStreamId}
        onGoBack={() => setActiveStreamId(null)}
      />
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "home":
      case "explore":
        return (
          <BrowseScreen
            onSelectStream={(id) => setActiveStreamId(id)}
          />
        );
      case "studio":
        if (studioScreen === "automations") {
          return <AutomationsScreen onGoBack={() => setStudioScreen("dashboard")} />;
        }
        return (
          <CreatorDashboardScreen
            onStartBroadcast={() => setIsBroadcasting(true)}
            onNavigateToAutomations={() => setStudioScreen("automations")}
          />
        );
      case "alerts":
        return <AlertsScreen />;
      case "profile":
        return (
          <ProfileScreen
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              if (tab !== "studio") {
                setStudioScreen("dashboard");
              }
            }}
          />
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Active Tab Screen Body */}
      <View style={styles.body}>{renderTabContent()}</View>

      {/* Floating Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        {/* Tab 1: Home */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "home" && styles.tabItemActive]}
          onPress={() => setActiveTab("home")}
        >
          <Text style={[styles.tabIcon, activeTab === "home" && styles.tabIconActive]}>
            🏠
          </Text>
          <Text style={[styles.tabLabel, activeTab === "home" && styles.tabLabelActive]}>
            Home
          </Text>
        </TouchableOpacity>

        {/* Center Tab: Live Broadcast */}
        <TouchableOpacity
          style={styles.centerTabItem}
          onPress={() => setIsBroadcasting(true)}
        >
          <View style={styles.liveCircleButton}>
            <Text style={styles.liveCircleButtonText}>((o))</Text>
          </View>
        </TouchableOpacity>

        {/* Tab 4: Alerts */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "alerts" && styles.tabItemActive]}
          onPress={() => setActiveTab("alerts")}
        >
          <View style={styles.badgeContainer}>
            <Text style={[styles.tabIcon, activeTab === "alerts" && styles.tabIconActive]}>
              🔔
            </Text>
            {unreadCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.tabLabel, activeTab === "alerts" && styles.tabLabelActive]}>
            Alerts
          </Text>
        </TouchableOpacity>

        {/* Tab 5: Profile */}
        <TouchableOpacity
          style={[styles.tabItem, (activeTab === "profile" || activeTab === "studio") && styles.tabItemActive]}
          onPress={() => {
            setActiveTab("profile");
            setStudioScreen("dashboard");
          }}
        >
          <Text style={[styles.tabIcon, (activeTab === "profile" || activeTab === "studio") && styles.tabIconActive]}>
            👤
          </Text>
          <Text style={[styles.tabLabel, (activeTab === "profile" || activeTab === "studio") && styles.tabLabelActive]}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>

      {/* Network Offline Toast */}
      {isOfflineToastVisible && (
        <View style={styles.offlineToast}>
          <Text style={styles.toastText}>📶 Connection Lost: You are offline</Text>
        </View>
      )}

      {/* Network Restored Toast */}
      {isOnlineToastVisible && (
        <View style={styles.onlineToast}>
          <Text style={styles.toastText}>🟢 Connection Restored: Back Online</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  logoText: {
    fontSize: 48,
    fontWeight: "bold",
    color: Theme.colors.primary,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 32,
  },
  card: {
    width: "100%",
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 24,
    marginBottom: 24,
    alignItems: "center",
    // Soft shadow
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  greeting: {
    fontSize: 22,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 16,
    textAlign: "center",
  },
  uuidLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.colors.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  uuidText: {
    fontSize: 13,
    color: Theme.colors.text,
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    backgroundColor: Theme.colors.inputBg,
    padding: 8,
    borderRadius: Theme.roundness.small,
    overflow: "hidden",
  },
  goLiveButton: {
    width: "100%",
    height: 56,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  goLiveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  body: {
    flex: 1,
  },
  tabBar: {
    height: Platform.OS === "ios" ? 78 : 64,
    flexDirection: "row",
    backgroundColor: Theme.colors.surface,
    borderTopWidth: 1,
    borderColor: Theme.colors.border,
    paddingBottom: Platform.OS === "ios" ? 20 : 8,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemActive: {},
  tabIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: Theme.colors.primary,
    fontWeight: "bold",
  },
  tabPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: Theme.colors.background,
  },
  placeholderIcon: {
    fontSize: 54,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  placeholderSub: {
    fontSize: 14,
    color: Theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  profileContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  profileAvatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  profileAvatarTextLarge: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  logoutButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: Theme.roundness.medium,
    borderWidth: 1.5,
    borderColor: Theme.colors.accent,
    width: "100%",
    alignItems: "center",
    marginTop: 10,
  },
  logoutText: {
    color: Theme.colors.accent,
    fontWeight: "bold",
    fontSize: 16,
  },
  centerTabItem: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  liveCircleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1F2024",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  liveCircleButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  badgeContainer: {
    position: "relative",
  },
  tabBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#FF3B30",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  tabBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "bold",
  },
  alertContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: Theme.colors.background,
  },
  alertHeaderTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 20,
    marginTop: 10,
  },
  alertCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: Theme.roundness.medium,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    padding: 16,
    marginBottom: 14,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 4,
  },
  alertBody: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
    lineHeight: 18,
  },
  alertTime: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginTop: 6,
    fontWeight: "600",
  },
  offlineToast: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    left: 20,
    right: 20,
    backgroundColor: "#E25C5C", // Premium soft warm red
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  onlineToast: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 30,
    left: 20,
    right: 20,
    backgroundColor: "#6B8E78", // Premium soft warm sage-green
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: Theme.roundness.medium,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 0.3,
  },
});
