import type { ThemeListResponse, ThemeRecord, ThemeTokens } from "./types";

export const defaultThemeId = "noterious-night";
export const themeCacheStorageKey = "noterious.theme-cache";

const builtinThemes: ThemeRecord[] = [
  {
    version: 1,
    id: "noterious-night",
    name: "Noterious Night",
    source: "builtin",
    kind: "dark",
    description: "The original Noterious night palette.",
    tokens: {
      bg: "#16161e",
      bgGradientStart: "#16161e",
      bgGradientEnd: "#13141c",
      bgGlowA: "rgba(122, 162, 247, 0.08)",
      bgGlowB: "rgba(187, 154, 247, 0.06)",
      sidebar: "rgba(22, 23, 31, 0.98)",
      sidebarSoft: "rgba(17, 19, 28, 0.9)",
      panel: "rgba(26, 27, 38, 0.9)",
      panelStrong: "#1f2335",
      surface: "#24283b",
      surfaceSoft: "#1a1b26",
      overlay: "rgba(24, 25, 34, 0.99)",
      overlaySoft: "rgba(17, 19, 28, 0.92)",
      table: "rgba(26, 27, 38, 0.78)",
      tableHeader: "rgba(122, 162, 247, 0.05)",
      editorOverlay: "rgba(26, 27, 38, 0.96)",
      ink: "#c0caf5",
      muted: "#7a83a8",
      accent: "#7aa2f7",
      accentSoft: "rgba(122, 162, 247, 0.14)",
      warn: "#f7768e",
      line: "rgba(122, 162, 247, 0.13)",
      lineStrong: "rgba(122, 162, 247, 0.28)",
      focusRing: "rgba(122, 162, 247, 0.35)",
      selection: "rgba(122, 162, 247, 0.22)",
      shadow: "0 16px 40px rgba(0, 0, 0, 0.34)",
      themeColor: "#11131d",
    },
  },
  {
    version: 1,
    id: "paper",
    name: "Paper",
    source: "builtin",
    kind: "light",
    description: "A warm paper-like light theme.",
    tokens: {
      bg: "#f5efe4",
      bgGradientStart: "#fbf5eb",
      bgGradientEnd: "#eadfcd",
      bgGlowA: "rgba(173, 112, 56, 0.09)",
      bgGlowB: "rgba(124, 149, 176, 0.06)",
      sidebar: "rgba(232, 221, 205, 0.98)",
      sidebarSoft: "rgba(241, 231, 216, 0.96)",
      panel: "rgba(255, 251, 245, 0.94)",
      panelStrong: "#ebdecc",
      surface: "#e3d4bc",
      surfaceSoft: "#f5ebdc",
      overlay: "rgba(252, 247, 241, 0.99)",
      overlaySoft: "rgba(246, 238, 228, 0.96)",
      table: "rgba(239, 231, 220, 0.94)",
      tableHeader: "rgba(154, 90, 41, 0.1)",
      editorOverlay: "rgba(247, 240, 231, 0.98)",
      ink: "#3a2e22",
      muted: "#75614b",
      accent: "#9a5a29",
      accentSoft: "rgba(154, 90, 41, 0.15)",
      warn: "#ab4c56",
      line: "rgba(154, 90, 41, 0.16)",
      lineStrong: "rgba(154, 90, 41, 0.28)",
      focusRing: "rgba(154, 90, 41, 0.36)",
      selection: "rgba(154, 90, 41, 0.18)",
      shadow: "0 16px 36px rgba(101, 67, 33, 0.14)",
      themeColor: "#efe2cf",
    },
  },
  {
    version: 1,
    id: "arc",
    name: "Arc",
    source: "builtin",
    kind: "light",
    description: "Clean blue-gray chrome inspired by Arc.",
    tokens: {
      bg: "#eef2f7",
      bgGradientStart: "#f6f8fb",
      bgGradientEnd: "#dfe7f1",
      bgGlowA: "rgba(82, 116, 188, 0.08)",
      bgGlowB: "rgba(70, 154, 209, 0.06)",
      sidebar: "rgba(220, 229, 239, 0.98)",
      sidebarSoft: "rgba(232, 238, 246, 0.96)",
      panel: "rgba(250, 252, 255, 0.95)",
      panelStrong: "#dfe6ef",
      surface: "#d7e0ea",
      surfaceSoft: "#eef3f8",
      overlay: "rgba(248, 251, 255, 0.99)",
      overlaySoft: "rgba(240, 245, 251, 0.96)",
      table: "rgba(231, 237, 244, 0.94)",
      tableHeader: "rgba(82, 116, 188, 0.08)",
      editorOverlay: "rgba(238, 244, 250, 0.98)",
      ink: "#2f3947",
      muted: "#627182",
      accent: "#4f74bc",
      accentSoft: "rgba(79, 116, 188, 0.15)",
      warn: "#c75359",
      line: "rgba(79, 116, 188, 0.14)",
      lineStrong: "rgba(79, 116, 188, 0.26)",
      focusRing: "rgba(79, 116, 188, 0.34)",
      selection: "rgba(79, 116, 188, 0.18)",
      shadow: "0 16px 36px rgba(53, 76, 107, 0.14)",
      themeColor: "#e4ebf4",
    },
  },
  {
    version: 1,
    id: "arc-dark",
    name: "Arc Dark",
    source: "builtin",
    kind: "dark",
    description: "Arc's cool dark chrome with restrained blue accents.",
    tokens: {
      bg: "#2f343f",
      bgGradientStart: "#343944",
      bgGradientEnd: "#2a2f39",
      bgGlowA: "rgba(82, 116, 188, 0.08)",
      bgGlowB: "rgba(70, 154, 209, 0.05)",
      sidebar: "rgba(47, 52, 63, 0.98)",
      sidebarSoft: "rgba(56, 62, 75, 0.93)",
      panel: "rgba(60, 67, 80, 0.92)",
      panelStrong: "#434c5c",
      surface: "#4c5668",
      surfaceSoft: "#394150",
      overlay: "rgba(60, 67, 80, 0.99)",
      overlaySoft: "rgba(67, 75, 89, 0.95)",
      table: "rgba(67, 75, 89, 0.92)",
      tableHeader: "rgba(82, 116, 188, 0.1)",
      editorOverlay: "rgba(67, 75, 89, 0.98)",
      ink: "#d8dee9",
      muted: "#a3afc2",
      accent: "#729fcf",
      accentSoft: "rgba(114, 159, 207, 0.16)",
      warn: "#d06b75",
      line: "rgba(114, 159, 207, 0.14)",
      lineStrong: "rgba(114, 159, 207, 0.28)",
      focusRing: "rgba(114, 159, 207, 0.36)",
      selection: "rgba(114, 159, 207, 0.22)",
      shadow: "0 16px 40px rgba(12, 16, 24, 0.36)",
      themeColor: "#343944",
    },
  },
  {
    version: 1,
    id: "nord",
    name: "Nord",
    source: "builtin",
    kind: "dark",
    description: "Arctic blue-gray with crisp Nord contrast.",
    tokens: {
      bg: "#2e3440",
      bgGradientStart: "#2e3440",
      bgGradientEnd: "#242933",
      bgGlowA: "rgba(129, 161, 193, 0.08)",
      bgGlowB: "rgba(94, 129, 172, 0.06)",
      sidebar: "rgba(46, 52, 64, 0.98)",
      sidebarSoft: "rgba(52, 60, 74, 0.93)",
      panel: "rgba(59, 66, 82, 0.92)",
      panelStrong: "#434c5e",
      surface: "#4c566a",
      surfaceSoft: "#3b4252",
      overlay: "rgba(59, 66, 82, 0.99)",
      overlaySoft: "rgba(67, 76, 94, 0.95)",
      table: "rgba(67, 76, 94, 0.92)",
      tableHeader: "rgba(129, 161, 193, 0.1)",
      editorOverlay: "rgba(67, 76, 94, 0.98)",
      ink: "#eceff4",
      muted: "#a7b1c2",
      accent: "#88c0d0",
      accentSoft: "rgba(136, 192, 208, 0.16)",
      warn: "#bf616a",
      line: "rgba(136, 192, 208, 0.14)",
      lineStrong: "rgba(136, 192, 208, 0.28)",
      focusRing: "rgba(136, 192, 208, 0.36)",
      selection: "rgba(136, 192, 208, 0.22)",
      shadow: "0 16px 40px rgba(16, 20, 28, 0.34)",
      themeColor: "#2e3440",
    },
  },
  {
    version: 1,
    id: "dracula",
    name: "Dracula",
    source: "builtin",
    kind: "dark",
    description: "Beloved violet-tinted dark theme with neon accents.",
    tokens: {
      bg: "#282a36",
      bgGradientStart: "#282a36",
      bgGradientEnd: "#22242f",
      bgGlowA: "rgba(189, 147, 249, 0.09)",
      bgGlowB: "rgba(80, 250, 123, 0.05)",
      sidebar: "rgba(40, 42, 54, 0.98)",
      sidebarSoft: "rgba(47, 49, 64, 0.93)",
      panel: "rgba(50, 52, 68, 0.92)",
      panelStrong: "#3a3d4f",
      surface: "#44475a",
      surfaceSoft: "#343746",
      overlay: "rgba(50, 52, 68, 0.99)",
      overlaySoft: "rgba(58, 61, 79, 0.95)",
      table: "rgba(58, 61, 79, 0.92)",
      tableHeader: "rgba(189, 147, 249, 0.1)",
      editorOverlay: "rgba(58, 61, 79, 0.98)",
      ink: "#f8f8f2",
      muted: "#b7b9c7",
      accent: "#bd93f9",
      accentSoft: "rgba(189, 147, 249, 0.16)",
      warn: "#ff5555",
      line: "rgba(189, 147, 249, 0.14)",
      lineStrong: "rgba(189, 147, 249, 0.28)",
      focusRing: "rgba(189, 147, 249, 0.36)",
      selection: "rgba(189, 147, 249, 0.22)",
      shadow: "0 16px 40px rgba(16, 15, 22, 0.38)",
      themeColor: "#282a36",
    },
  },
  {
    version: 1,
    id: "solarized-light",
    name: "Solarized Light",
    source: "builtin",
    kind: "light",
    description: "The classic Solarized light palette.",
    tokens: {
      bg: "#fdf6e3",
      bgGradientStart: "#fdf6e3",
      bgGradientEnd: "#eee8d5",
      bgGlowA: "rgba(181, 137, 0, 0.08)",
      bgGlowB: "rgba(38, 139, 210, 0.05)",
      sidebar: "rgba(245, 236, 210, 0.98)",
      sidebarSoft: "rgba(251, 244, 225, 0.96)",
      panel: "rgba(253, 246, 227, 0.95)",
      panelStrong: "#eee8d5",
      surface: "#e7dfc8",
      surfaceSoft: "#f7f1dd",
      overlay: "rgba(253, 246, 227, 0.99)",
      overlaySoft: "rgba(247, 240, 220, 0.96)",
      table: "rgba(244, 236, 213, 0.94)",
      tableHeader: "rgba(38, 139, 210, 0.08)",
      editorOverlay: "rgba(247, 240, 220, 0.98)",
      ink: "#586e75",
      muted: "#7b8c8f",
      accent: "#268bd2",
      accentSoft: "rgba(38, 139, 210, 0.14)",
      warn: "#dc322f",
      line: "rgba(38, 139, 210, 0.14)",
      lineStrong: "rgba(38, 139, 210, 0.24)",
      focusRing: "rgba(38, 139, 210, 0.32)",
      selection: "rgba(38, 139, 210, 0.16)",
      shadow: "0 16px 36px rgba(88, 110, 117, 0.14)",
      themeColor: "#f4edd8",
    },
  },
  {
    version: 1,
    id: "solarized-dark",
    name: "Solarized Dark",
    source: "builtin",
    kind: "dark",
    description: "The classic Solarized dark palette.",
    tokens: {
      bg: "#002b36",
      bgGradientStart: "#002b36",
      bgGradientEnd: "#001f27",
      bgGlowA: "rgba(42, 161, 152, 0.08)",
      bgGlowB: "rgba(38, 139, 210, 0.06)",
      sidebar: "rgba(0, 43, 54, 0.98)",
      sidebarSoft: "rgba(6, 53, 66, 0.92)",
      panel: "rgba(7, 54, 66, 0.92)",
      panelStrong: "#073642",
      surface: "#0c4654",
      surfaceSoft: "#073642",
      overlay: "rgba(7, 54, 66, 0.99)",
      overlaySoft: "rgba(9, 62, 76, 0.95)",
      table: "rgba(8, 63, 76, 0.92)",
      tableHeader: "rgba(42, 161, 152, 0.1)",
      editorOverlay: "rgba(9, 62, 76, 0.98)",
      ink: "#93a1a1",
      muted: "#6c8588",
      accent: "#2aa198",
      accentSoft: "rgba(42, 161, 152, 0.16)",
      warn: "#dc322f",
      line: "rgba(42, 161, 152, 0.14)",
      lineStrong: "rgba(42, 161, 152, 0.28)",
      focusRing: "rgba(42, 161, 152, 0.36)",
      selection: "rgba(42, 161, 152, 0.2)",
      shadow: "0 16px 40px rgba(0, 0, 0, 0.34)",
      themeColor: "#002b36",
    },
  },
  {
    version: 1,
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    source: "builtin",
    kind: "light",
    description: "Creamy Catppuccin light tones with rose accents.",
    tokens: {
      bg: "#eff1f5",
      bgGradientStart: "#f5f6fa",
      bgGradientEnd: "#e6e9ef",
      bgGlowA: "rgba(220, 138, 120, 0.08)",
      bgGlowB: "rgba(30, 102, 245, 0.05)",
      sidebar: "rgba(220, 224, 232, 0.98)",
      sidebarSoft: "rgba(234, 237, 243, 0.96)",
      panel: "rgba(252, 252, 253, 0.95)",
      panelStrong: "#e6e9ef",
      surface: "#dce0e8",
      surfaceSoft: "#eff1f5",
      overlay: "rgba(250, 251, 252, 0.99)",
      overlaySoft: "rgba(239, 241, 245, 0.96)",
      table: "rgba(230, 233, 239, 0.94)",
      tableHeader: "rgba(30, 102, 245, 0.08)",
      editorOverlay: "rgba(239, 241, 245, 0.98)",
      ink: "#4c4f69",
      muted: "#7c7f93",
      accent: "#1e66f5",
      accentSoft: "rgba(30, 102, 245, 0.14)",
      warn: "#d20f39",
      line: "rgba(30, 102, 245, 0.14)",
      lineStrong: "rgba(30, 102, 245, 0.24)",
      focusRing: "rgba(30, 102, 245, 0.32)",
      selection: "rgba(30, 102, 245, 0.16)",
      shadow: "0 16px 36px rgba(76, 79, 105, 0.14)",
      themeColor: "#e6e9ef",
    },
  },
  {
    version: 1,
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    source: "builtin",
    kind: "dark",
    description: "The widely loved Catppuccin mocha palette.",
    tokens: {
      bg: "#1e1e2e",
      bgGradientStart: "#1e1e2e",
      bgGradientEnd: "#181825",
      bgGlowA: "rgba(203, 166, 247, 0.08)",
      bgGlowB: "rgba(137, 180, 250, 0.06)",
      sidebar: "rgba(24, 24, 37, 0.98)",
      sidebarSoft: "rgba(30, 30, 46, 0.93)",
      panel: "rgba(49, 50, 68, 0.92)",
      panelStrong: "#313244",
      surface: "#45475a",
      surfaceSoft: "#1e1e2e",
      overlay: "rgba(49, 50, 68, 0.99)",
      overlaySoft: "rgba(57, 59, 79, 0.95)",
      table: "rgba(57, 59, 79, 0.92)",
      tableHeader: "rgba(137, 180, 250, 0.1)",
      editorOverlay: "rgba(57, 59, 79, 0.98)",
      ink: "#cdd6f4",
      muted: "#a6adc8",
      accent: "#89b4fa",
      accentSoft: "rgba(137, 180, 250, 0.16)",
      warn: "#f38ba8",
      line: "rgba(137, 180, 250, 0.14)",
      lineStrong: "rgba(137, 180, 250, 0.28)",
      focusRing: "rgba(137, 180, 250, 0.36)",
      selection: "rgba(137, 180, 250, 0.22)",
      shadow: "0 16px 40px rgba(0, 0, 0, 0.36)",
      themeColor: "#1e1e2e",
    },
  },
  {
    version: 1,
    id: "base16-ocean",
    name: "Base16 Ocean",
    source: "builtin",
    kind: "dark",
    description: "The classic Base16 Ocean variant.",
    tokens: {
      bg: "#2b303b",
      bgGradientStart: "#2b303b",
      bgGradientEnd: "#252a34",
      bgGlowA: "rgba(143, 161, 179, 0.08)",
      bgGlowB: "rgba(102, 153, 204, 0.06)",
      sidebar: "rgba(43, 48, 59, 0.98)",
      sidebarSoft: "rgba(52, 58, 71, 0.93)",
      panel: "rgba(52, 58, 71, 0.92)",
      panelStrong: "#343d46",
      surface: "#4f5b66",
      surfaceSoft: "#343d46",
      overlay: "rgba(52, 58, 71, 0.99)",
      overlaySoft: "rgba(62, 69, 84, 0.95)",
      table: "rgba(62, 69, 84, 0.92)",
      tableHeader: "rgba(143, 161, 179, 0.1)",
      editorOverlay: "rgba(62, 69, 84, 0.98)",
      ink: "#c0c5ce",
      muted: "#a7adba",
      accent: "#8fa1b3",
      accentSoft: "rgba(143, 161, 179, 0.16)",
      warn: "#bf616a",
      line: "rgba(143, 161, 179, 0.14)",
      lineStrong: "rgba(143, 161, 179, 0.28)",
      focusRing: "rgba(143, 161, 179, 0.36)",
      selection: "rgba(143, 161, 179, 0.22)",
      shadow: "0 16px 40px rgba(17, 20, 26, 0.36)",
      themeColor: "#2b303b",
    },
  },
  {
    version: 1,
    id: "base16-eighties",
    name: "Base16 Eighties",
    source: "builtin",
    kind: "dark",
    description: "The popular warm Base16 Eighties palette.",
    tokens: {
      bg: "#2d2d2d",
      bgGradientStart: "#2d2d2d",
      bgGradientEnd: "#262626",
      bgGlowA: "rgba(102, 153, 204, 0.07)",
      bgGlowB: "rgba(245, 245, 245, 0.03)",
      sidebar: "rgba(45, 45, 45, 0.98)",
      sidebarSoft: "rgba(57, 57, 57, 0.93)",
      panel: "rgba(57, 57, 57, 0.92)",
      panelStrong: "#393939",
      surface: "#515151",
      surfaceSoft: "#393939",
      overlay: "rgba(57, 57, 57, 0.99)",
      overlaySoft: "rgba(64, 64, 64, 0.95)",
      table: "rgba(64, 64, 64, 0.92)",
      tableHeader: "rgba(102, 153, 204, 0.1)",
      editorOverlay: "rgba(64, 64, 64, 0.98)",
      ink: "#d3d0c8",
      muted: "#b0a99f",
      accent: "#6699cc",
      accentSoft: "rgba(102, 153, 204, 0.16)",
      warn: "#f2777a",
      line: "rgba(102, 153, 204, 0.14)",
      lineStrong: "rgba(102, 153, 204, 0.28)",
      focusRing: "rgba(102, 153, 204, 0.36)",
      selection: "rgba(102, 153, 204, 0.22)",
      shadow: "0 16px 40px rgba(0, 0, 0, 0.36)",
      themeColor: "#2d2d2d",
    },
  },
  {
    version: 1,
    id: "base16-material",
    name: "Base16 Material",
    source: "builtin",
    kind: "dark",
    description: "Material-inspired Base16 with softened contrast.",
    tokens: {
      bg: "#263238",
      bgGradientStart: "#263238",
      bgGradientEnd: "#202a30",
      bgGlowA: "rgba(130, 170, 255, 0.08)",
      bgGlowB: "rgba(137, 221, 255, 0.05)",
      sidebar: "rgba(38, 50, 56, 0.98)",
      sidebarSoft: "rgba(45, 58, 64, 0.93)",
      panel: "rgba(49, 63, 69, 0.92)",
      panelStrong: "#314047",
      surface: "#546e7a",
      surfaceSoft: "#314047",
      overlay: "rgba(49, 63, 69, 0.99)",
      overlaySoft: "rgba(57, 72, 79, 0.95)",
      table: "rgba(57, 72, 79, 0.92)",
      tableHeader: "rgba(130, 170, 255, 0.1)",
      editorOverlay: "rgba(57, 72, 79, 0.98)",
      ink: "#eeffff",
      muted: "#aabfc9",
      accent: "#82aaff",
      accentSoft: "rgba(130, 170, 255, 0.16)",
      warn: "#f07178",
      line: "rgba(130, 170, 255, 0.14)",
      lineStrong: "rgba(130, 170, 255, 0.28)",
      focusRing: "rgba(130, 170, 255, 0.36)",
      selection: "rgba(130, 170, 255, 0.22)",
      shadow: "0 16px 40px rgba(12, 18, 22, 0.36)",
      themeColor: "#263238",
    },
  },
  {
    version: 1,
    id: "spruce",
    name: "Spruce",
    source: "builtin",
    kind: "dark",
    description: "Deep green graphite with soft spruce accents.",
    tokens: {
      bg: "#101815",
      bgGradientStart: "#101815",
      bgGradientEnd: "#0c1210",
      bgGlowA: "rgba(102, 187, 106, 0.1)",
      bgGlowB: "rgba(120, 197, 154, 0.06)",
      sidebar: "rgba(15, 22, 19, 0.98)",
      sidebarSoft: "rgba(16, 24, 21, 0.92)",
      panel: "rgba(18, 27, 24, 0.9)",
      panelStrong: "#1a2b25",
      surface: "#20362f",
      surfaceSoft: "#16231f",
      overlay: "rgba(18, 27, 24, 0.98)",
      overlaySoft: "rgba(19, 30, 26, 0.94)",
      table: "rgba(22, 35, 30, 0.9)",
      tableHeader: "rgba(108, 188, 120, 0.1)",
      editorOverlay: "rgba(20, 31, 27, 0.98)",
      ink: "#d3e9df",
      muted: "#8fa89d",
      accent: "#6cbc78",
      accentSoft: "rgba(108, 188, 120, 0.16)",
      warn: "#e1787e",
      line: "rgba(108, 188, 120, 0.14)",
      lineStrong: "rgba(108, 188, 120, 0.26)",
      focusRing: "rgba(108, 188, 120, 0.36)",
      selection: "rgba(108, 188, 120, 0.2)",
      shadow: "0 16px 40px rgba(0, 0, 0, 0.32)",
      themeColor: "#111a17",
    },
  },
  {
    version: 1,
    id: "graphite",
    name: "Graphite",
    source: "builtin",
    kind: "dark",
    description: "Neutral graphite with cool steel highlights.",
    tokens: {
      bg: "#181a1f",
      bgGradientStart: "#181a1f",
      bgGradientEnd: "#13151a",
      bgGlowA: "rgba(133, 154, 176, 0.08)",
      bgGlowB: "rgba(96, 120, 148, 0.06)",
      sidebar: "rgba(22, 24, 29, 0.98)",
      sidebarSoft: "rgba(24, 26, 31, 0.92)",
      panel: "rgba(28, 30, 36, 0.9)",
      panelStrong: "#242830",
      surface: "#303641",
      surfaceSoft: "#1f242c",
      overlay: "rgba(25, 27, 33, 0.99)",
      overlaySoft: "rgba(28, 31, 37, 0.95)",
      table: "rgba(38, 42, 50, 0.9)",
      tableHeader: "rgba(134, 164, 195, 0.1)",
      editorOverlay: "rgba(30, 33, 39, 0.98)",
      ink: "#dde3ea",
      muted: "#98a5b4",
      accent: "#86a4c3",
      accentSoft: "rgba(134, 164, 195, 0.16)",
      warn: "#d97777",
      line: "rgba(134, 164, 195, 0.14)",
      lineStrong: "rgba(134, 164, 195, 0.26)",
      focusRing: "rgba(134, 164, 195, 0.36)",
      selection: "rgba(134, 164, 195, 0.2)",
      shadow: "0 16px 40px rgba(0, 0, 0, 0.34)",
      themeColor: "#191b20",
    },
  },
];

const tokenKeys: Array<keyof ThemeTokens> = [
  "bg",
  "bgGradientStart",
  "bgGradientEnd",
  "bgGlowA",
  "bgGlowB",
  "sidebar",
  "sidebarSoft",
  "panel",
  "panelStrong",
  "surface",
  "surfaceSoft",
  "overlay",
  "overlaySoft",
  "table",
  "tableHeader",
  "editorOverlay",
  "ink",
  "muted",
  "accent",
  "accentSoft",
  "warn",
  "line",
  "lineStrong",
  "focusRing",
  "selection",
  "shadow",
  "themeColor",
];

const cssVarMap: Record<keyof ThemeTokens, string> = {
  bg: "--bg",
  bgGradientStart: "--bg-gradient-start",
  bgGradientEnd: "--bg-gradient-end",
  bgGlowA: "--bg-glow-a",
  bgGlowB: "--bg-glow-b",
  sidebar: "--sidebar",
  sidebarSoft: "--sidebar-soft",
  panel: "--panel",
  panelStrong: "--panel-strong",
  surface: "--surface",
  surfaceSoft: "--surface-soft",
  overlay: "--overlay",
  overlaySoft: "--overlay-soft",
  table: "--table",
  tableHeader: "--table-header",
  editorOverlay: "--editor-overlay",
  ink: "--ink",
  muted: "--muted",
  accent: "--accent",
  accentSoft: "--accent-soft",
  warn: "--warn",
  line: "--line",
  lineStrong: "--line-strong",
  focusRing: "--focus-ring",
  selection: "--selection",
  shadow: "--shadow",
  themeColor: "--theme-color",
};

export function builtinThemeLibrary(): ThemeRecord[] {
  return builtinThemes.map(cloneThemeRecord);
}

export function builtinThemeMap(): Record<string, ThemeRecord> {
  const result: Record<string, ThemeRecord> = {};
  builtinThemeLibrary().forEach(function (theme) {
    result[theme.id] = theme;
  });
  return result;
}

export function cloneThemeRecord(theme: ThemeRecord): ThemeRecord {
  return {
    version: Number(theme.version) || 1,
    id: String(theme.id || "").trim(),
    name: String(theme.name || "").trim(),
    source: theme.source === "custom" ? "custom" : "builtin",
    kind: theme.kind === "light" ? "light" : "dark",
    description: String(theme.description || "").trim(),
    tokens: normalizeThemeTokens(theme.tokens),
  };
}

export function normalizeThemeTokens(input: unknown): ThemeTokens {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const defaults = builtinThemes[0].tokens;
  const result = {} as ThemeTokens;
  tokenKeys.forEach(function (key) {
    const value = String(source[key] ?? defaults[key] ?? "").trim();
    result[key] = value || defaults[key];
  });
  return result;
}

export function normalizeThemeRecord(input: unknown): ThemeRecord | null {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : null;
  if (!source) {
    return null;
  }
  const id = String(source.id || "").trim();
  const name = String(source.name || "").trim();
  if (!id || !name) {
    return null;
  }
  return {
    version: Number(source.version) || 1,
    id: id,
    name: name,
    source: source.source === "custom" ? "custom" : "builtin",
    kind: source.kind === "light" ? "light" : "dark",
    description: String(source.description || "").trim(),
    tokens: normalizeThemeTokens(source.tokens),
  };
}

export function normalizeThemeListResponse(input: unknown): ThemeListResponse {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const themes = Array.isArray(source.themes)
    ? source.themes.map(normalizeThemeRecord).filter(Boolean) as ThemeRecord[]
    : [];
  return {
    themes: themes,
    count: Number(source.count) || themes.length,
  };
}

export function loadStoredThemeCache(): Record<string, ThemeRecord> {
  try {
    const raw = window.localStorage.getItem(themeCacheStorageKey);
    if (!raw) {
      return {};
    }
    const source = JSON.parse(raw);
    if (!source || typeof source !== "object") {
      return {};
    }
    const result: Record<string, ThemeRecord> = {};
    Object.keys(source as Record<string, unknown>).forEach(function (id) {
      const theme = normalizeThemeRecord((source as Record<string, unknown>)[id]);
      if (theme) {
        result[theme.id] = theme;
      }
    });
    return result;
  } catch (_error) {
    return {};
  }
}

export function saveStoredThemeCache(cache: Record<string, ThemeRecord>): void {
  try {
    window.localStorage.setItem(themeCacheStorageKey, JSON.stringify(cache));
  } catch (_error) {
    // Ignore storage failures and continue with in-memory cache.
  }
}

export function mergeThemeCache(themes: ThemeRecord[]): Record<string, ThemeRecord> {
  const result: Record<string, ThemeRecord> = {};
  themes.forEach(function (theme) {
    if (theme.source === "custom") {
      result[theme.id] = cloneThemeRecord(theme);
    }
  });
  return result;
}

export function removeThemeFromCache(cache: Record<string, ThemeRecord>, themeID: string): Record<string, ThemeRecord> {
  const result: Record<string, ThemeRecord> = {};
  Object.keys(cache || {}).forEach(function (id) {
    if (id !== themeID) {
      result[id] = cloneThemeRecord(cache[id]);
    }
  });
  return result;
}

export function themeLibraryMap(themes: ThemeRecord[]): Record<string, ThemeRecord> {
  const result = builtinThemeMap();
  (Array.isArray(themes) ? themes : []).forEach(function (theme) {
    result[theme.id] = cloneThemeRecord(theme);
  });
  return result;
}

export function resolveTheme(themeID: string, library: ThemeRecord[], cache: Record<string, ThemeRecord>): ThemeRecord {
  const desiredID = String(themeID || "").trim() || defaultThemeId;
  const fromLibrary = themeLibraryMap(library)[desiredID];
  if (fromLibrary) {
    return cloneThemeRecord(fromLibrary);
  }
  if (cache && cache[desiredID]) {
    return cloneThemeRecord(cache[desiredID]);
  }
  return cloneThemeRecord(builtinThemeMap()[defaultThemeId]);
}

export function applyTheme(theme: ThemeRecord): void {
  const root = document.documentElement;
  tokenKeys.forEach(function (key) {
    root.style.setProperty(cssVarMap[key], theme.tokens[key]);
  });
  root.style.colorScheme = theme.kind;
  root.setAttribute("data-theme-id", theme.id);
  root.setAttribute("data-theme-kind", theme.kind);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && typeof meta === "object" && "content" in meta) {
    (meta as { content: string }).content = theme.tokens.themeColor || theme.tokens.bg || "#11131d";
  }
}
