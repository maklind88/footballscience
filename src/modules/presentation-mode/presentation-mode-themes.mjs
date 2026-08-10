const defaultTheme = "classic";

export const presentationThemeOptions = Object.freeze([
  {
    value: "classic",
    label: "Club Dark",
    accentColor: "#22c55e",
    textColor: "#f8fafc",
    backgroundColor: "#08120f",
    glowColor: "#0f766e",
  },
  {
    value: "matchday",
    label: "Match Day",
    accentColor: "#f59e0b",
    textColor: "#ffffff",
    backgroundColor: "#14110b",
    glowColor: "#d92d3f",
  },
  {
    value: "blueprint",
    label: "Blueprint",
    accentColor: "#38bdf8",
    textColor: "#f8fafc",
    backgroundColor: "#07111f",
    glowColor: "#0369a1",
  },
  {
    value: "stadium",
    label: "Stadium Lights",
    accentColor: "#a7f3d0",
    textColor: "#ffffff",
    backgroundColor: "#09111a",
    glowColor: "#1d4ed8",
  },
  {
    value: "tactical",
    label: "Tactical Board",
    accentColor: "#f8fafc",
    textColor: "#f8fafc",
    backgroundColor: "#17211b",
    glowColor: "#15803d",
  },
  {
    value: "recovery",
    label: "Recovery",
    accentColor: "#2dd4bf",
    textColor: "#ecfeff",
    backgroundColor: "#06231f",
    glowColor: "#14b8a6",
  },
  {
    value: "filmroom",
    label: "Film Room",
    accentColor: "#facc15",
    textColor: "#f8fafc",
    backgroundColor: "#111827",
    glowColor: "#92400e",
  },
  {
    value: "whiteboard",
    label: "Whiteboard",
    accentColor: "#2563eb",
    textColor: "#0f172a",
    backgroundColor: "#f3f7fb",
    glowColor: "#bfdbfe",
  },
  {
    value: "medical",
    label: "Medical Calm",
    accentColor: "#34d399",
    textColor: "#f8fafc",
    backgroundColor: "#0f172a",
    glowColor: "#0d9488",
  },
  {
    value: "clean",
    label: "Clean Light",
    accentColor: "#16a34a",
    textColor: "#111827",
    backgroundColor: "#f8fafc",
    glowColor: "#bbf7d0",
  },
  {
    value: "custom",
    label: "Custom",
    accentColor: "#22c55e",
    textColor: "#f8fafc",
    backgroundColor: "#08120f",
    glowColor: "#0f766e",
  },
]);

const presentationThemeMap = new Map(presentationThemeOptions.map((theme) => [theme.value, theme]));

function normalizeHexColor(value = "", fallback = "#f8fafc") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function getPresentationThemePreset(value = defaultTheme) {
  return presentationThemeMap.get(String(value || "").trim()) || presentationThemeMap.get(defaultTheme);
}

export function normalizePresentationSlideStyle(style = {}, fallback = {}) {
  const fallbackTheme = getPresentationThemePreset(fallback.theme || defaultTheme);
  const requestedTheme = String(style.theme || fallback.theme || defaultTheme).trim();
  const hasRequestedTheme = presentationThemeMap.has(requestedTheme);
  const theme = hasRequestedTheme ? requestedTheme : fallbackTheme.value;
  const preset = theme === "custom" ? fallbackTheme : getPresentationThemePreset(theme);
  return {
    theme,
    accentColor: normalizeHexColor(style.accentColor, fallback.accentColor || preset.accentColor),
    textColor: normalizeHexColor(style.textColor, fallback.textColor || preset.textColor),
    backgroundColor: normalizeHexColor(style.backgroundColor, fallback.backgroundColor || preset.backgroundColor),
    glowColor: normalizeHexColor(style.glowColor, fallback.glowColor || preset.glowColor),
  };
}
