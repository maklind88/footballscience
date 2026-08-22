const defaultTheme = "whiteboard";

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
const readableLightTextColor = "#f8fafc";
const readableDarkTextColor = "#111827";
const minimumTextContrast = 4.5;

function normalizeHexColor(value = "", fallback = "#f8fafc") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function getLinearChannel(value = 0) {
  const channel = value / 255;
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function getColorLuminance(value = "") {
  const color = normalizeHexColor(value, "#000000");
  const red = getLinearChannel(parseInt(color.slice(1, 3), 16));
  const green = getLinearChannel(parseInt(color.slice(3, 5), 16));
  const blue = getLinearChannel(parseInt(color.slice(5, 7), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function getContrastRatio(firstColor = "", secondColor = "") {
  const first = getColorLuminance(firstColor);
  const second = getColorLuminance(secondColor);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isReadablePresentationTextColor(backgroundColor = "", textColor = "") {
  const text = normalizeHexColor(textColor, "");
  if (!text) {
    return false;
  }
  return getContrastRatio(backgroundColor, text) >= minimumTextContrast;
}

export function getReadablePresentationTextColor(backgroundColor = "", preferredTextColor = "") {
  const background = normalizeHexColor(backgroundColor, "#08120f");
  const preferred = normalizeHexColor(preferredTextColor, "");
  if (preferred && isReadablePresentationTextColor(background, preferred)) {
    return preferred;
  }

  const lightContrast = getContrastRatio(background, readableLightTextColor);
  const darkContrast = getContrastRatio(background, readableDarkTextColor);
  return darkContrast > lightContrast ? readableDarkTextColor : readableLightTextColor;
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
  const backgroundColor = normalizeHexColor(style.backgroundColor, fallback.backgroundColor || preset.backgroundColor);
  const preferredTextColor = normalizeHexColor(style.textColor, fallback.textColor || preset.textColor);
  return {
    theme,
    accentColor: normalizeHexColor(style.accentColor, fallback.accentColor || preset.accentColor),
    textColor: getReadablePresentationTextColor(backgroundColor, preferredTextColor),
    backgroundColor,
    glowColor: normalizeHexColor(style.glowColor, fallback.glowColor || preset.glowColor),
  };
}
