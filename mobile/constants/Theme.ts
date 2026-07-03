/**
 * LiveCast Design System
 * Premium theme tokens matching the Figma design language.
 * Warm beige + sage green + soft rose palette.
 */
export const Theme = {
  colors: {
    // Core Backgrounds
    background: "#FAF7F2",     // Warm off-white parchment
    surface: "#FFFFFF",        // Pure white for cards
    surfaceAlt: "#F5F0E8",     // Slightly warm for nested containers

    // Brand Colors
    primary: "#7DAB8B",        // Refined Sage Green – primary CTA
    primaryDark: "#5A8C6B",    // Deeper sage for pressed states
    primaryLight: "#D6EAD9",   // Very light sage for backgrounds/chips

    accent: "#D98E8E",         // Soft rose – secondary highlights
    accentLight: "#F7DADA",    // Pale rose for tag backgrounds

    // Text
    text: "#1F2024",           // Near-black charcoal
    textSecondary: "#4A4D52",  // Dark grey for secondary content
    textMuted: "#8C9099",      // Mid-grey for hints/captions

    // UI
    border: "#E8E0D4",         // Warm beige border
    borderStrong: "#D4C9B8",   // Darker border for focus/dividers
    inputBg: "#F2EDE4",        // Warm input field background

    // Status
    error: "#C0392B",          // Clear red for errors
    success: "#27AE60",        // Clear green for success
    warning: "#F39C12",        // Amber for warnings
    live: "#E74C3C",           // Vivid red for LIVE badges

    // Overlays
    overlay: "rgba(0, 0, 0, 0.45)",
    overlayLight: "rgba(0, 0, 0, 0.25)",
  },

  roundness: {
    xs: 4,
    small: 8,
    medium: 14,
    large: 20,
    xl: 28,
    full: 9999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  typography: {
    displayLg: { fontSize: 32, fontWeight: "800" as const },
    displayMd: { fontSize: 26, fontWeight: "700" as const },
    headingLg: { fontSize: 22, fontWeight: "700" as const },
    headingMd: { fontSize: 18, fontWeight: "700" as const },
    headingSm: { fontSize: 16, fontWeight: "600" as const },
    bodyLg: { fontSize: 16, fontWeight: "400" as const },
    bodyMd: { fontSize: 14, fontWeight: "400" as const },
    bodySm: { fontSize: 12, fontWeight: "400" as const },
    labelLg: { fontSize: 14, fontWeight: "600" as const },
    labelSm: { fontSize: 11, fontWeight: "600" as const },
    mono: { fontSize: 12, fontFamily: "monospace" as const },
  },

  shadows: {
    sm: {
      shadowColor: "#C8B89A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: "#C8B89A",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 3,
    },
    lg: {
      shadowColor: "#C8B89A",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 6,
    },
    accent: {
      shadowColor: "#D98E8E",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 3,
    },
  },
};
