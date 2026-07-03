import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuthStore } from "../stores/authStore";
import { Theme } from "../constants/Theme";

export default function WelcomeScreen() {
  const [isLogin, setIsLogin] = useState(true); // Toggle between Login and Register mode
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);

  const handleSubmit = async () => {
    const cleanEmail = email.trim();
    const cleanPassword = password;
    const cleanName = displayName.trim();

    if (!cleanEmail) {
      setErrorMsg("Please enter an email address.");
      return;
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (!isLogin && !cleanName) {
      setErrorMsg("Please enter a display name.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    Keyboard.dismiss();

    try {
      if (isLogin) {
        await login(cleanEmail, cleanPassword);
      } else {
        await register(cleanName, cleanEmail, cleanPassword);
      }
    } catch (e: any) {
      console.warn("[Auth Submit Error]:", e);
      let msg = "Authentication failed. Please verify credentials.";
      if (e.message === "Network Error") {
        msg = "Network Error: Cannot connect to the server. Please ensure the Express backend is running and 'adb reverse tcp:3001 tcp:3001' is set up in terminal.";
      } else if (e.response?.data?.error) {
        msg = e.response.data.error;
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setErrorMsg("");
    setDisplayName("");
    setEmail("");
    setPassword("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          {/* Stream Logo Icon */}
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>((o))</Text>
            </View>
          </View>

          {/* Heading */}
          <View style={styles.headerContainer}>
            <Text style={styles.title}>LiveCast</Text>
            <Text style={styles.subtitle}>
              Stream live video, watch, and chat with creators in real-time.
            </Text>
          </View>

          {/* Auth Card */}
          <View style={styles.card}>
            {/* Mode Switch Tab Bar */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tabButton, isLogin && styles.tabButtonActive]}
                onPress={() => isLogin || toggleMode()}
              >
                <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, !isLogin && styles.tabButtonActive]}
                onPress={() => !isLogin || toggleMode()}
              >
                <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Sign Up</Text>
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <View style={styles.formContainer}>
              {!isLogin && (
                <>
                  <Text style={styles.label}>Display Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. CreatorPro"
                    placeholderTextColor={Theme.colors.textMuted}
                    value={displayName}
                    onChangeText={setDisplayName}
                    maxLength={20}
                    editable={!loading}
                  />
                </>
              )}

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="email@example.com"
                placeholderTextColor={Theme.colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••"
                placeholderTextColor={Theme.colors.textMuted}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />

              {!!errorMsg && <Text style={styles.errorText}>⚠️ {errorMsg}</Text>}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSubmit}
                activeOpacity={0.8}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    {isLogin ? "Log In →" : "Create Account →"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
  },
  logoText: {
    fontSize: 24,
    fontWeight: "bold",
    color: Theme.colors.primary,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: Theme.colors.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: Theme.colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.roundness.medium,
    padding: 20,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Theme.colors.inputBg,
    borderRadius: Theme.roundness.small,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: Theme.roundness.small - 2,
  },
  tabButtonActive: {
    backgroundColor: Theme.colors.surface,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.colors.textMuted,
  },
  tabTextActive: {
    color: Theme.colors.primary,
    fontWeight: "bold",
  },
  formContainer: {
    width: "100%",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.colors.text,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    height: 48,
    backgroundColor: Theme.colors.inputBg,
    borderRadius: Theme.roundness.small,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Theme.colors.text,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  errorText: {
    color: Theme.colors.error,
    fontSize: 13,
    marginTop: 6,
    fontWeight: "500",
  },
  button: {
    height: 48,
    backgroundColor: Theme.colors.primary,
    borderRadius: Theme.roundness.small,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
  },
});
