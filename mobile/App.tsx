import React, { useEffect } from "react";
import { StyleSheet, Text, View, SafeAreaView, ActivityIndicator, TouchableOpacity, Platform } from "react-native";
import { TextEncoder, TextDecoder } from "text-encoding";

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
import { Theme } from "./constants/Theme";

// Register LiveKit WebRTC Globals (Mandatory for react-native-webrtc native bridging)
registerGlobals();

type TabType = "studio" | "browse" | "profile";

export default function App() {
  const { identity, isChecked, checkIdentity, logout } = useAuthStore();
  const [isBroadcasting, setIsBroadcasting] = React.useState(false);
  const [activeStreamId, setActiveStreamId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabType>("studio");

  // Load identity from MMKV storage on mount
  useEffect(() => {
    checkIdentity();
  }, []);

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
      case "studio":
        return (
          <CreatorDashboardScreen
            onStartBroadcast={() => setIsBroadcasting(true)}
          />
        );
      case "browse":
        return (
          <BrowseScreen
            onSelectStream={(id) => setActiveStreamId(id)}
          />
        );
      case "profile":
        return <ProfileScreen />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Active Tab Screen Body */}
      <View style={styles.body}>{renderTabContent()}</View>

      {/* Floating Bottom Navigation Tab Bar */}
      <View style={styles.tabBar}>
        {/* Tab 1: Creator Studio */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "studio" && styles.tabItemActive]}
          onPress={() => setActiveTab("studio")}
        >
          <Text style={[styles.tabIcon, activeTab === "studio" && styles.tabIconActive]}>
            🎬
          </Text>
          <Text style={[styles.tabLabel, activeTab === "studio" && styles.tabLabelActive]}>
            Studio
          </Text>
        </TouchableOpacity>

        {/* Tab 2: Discover Browse */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "browse" && styles.tabItemActive]}
          onPress={() => setActiveTab("browse")}
        >
          <Text style={[styles.tabIcon, activeTab === "browse" && styles.tabIconActive]}>
            🧭
          </Text>
          <Text style={[styles.tabLabel, activeTab === "browse" && styles.tabLabelActive]}>
            Browse
          </Text>
        </TouchableOpacity>

        {/* Tab 3: Profile Settings */}
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "profile" && styles.tabItemActive]}
          onPress={() => setActiveTab("profile")}
        >
          <Text style={[styles.tabIcon, activeTab === "profile" && styles.tabIconActive]}>
            👤
          </Text>
          <Text style={[styles.tabLabel, activeTab === "profile" && styles.tabLabelActive]}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>
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
});
