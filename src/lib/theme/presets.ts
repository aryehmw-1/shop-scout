export type ThemeId = "warm" | "sage" | "ocean" | "slate" | "rose";

export interface ThemePreset {
  id: ThemeId;
  label: string;
  swatch: string;
  vars: Record<string, string>;
}

/** Simple full-page color themes — applied via CSS variables on :root */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "warm",
    label: "Warm cream",
    swatch: "#ea580c",
    vars: {
      "--background": "#faf6f0",
      "--foreground": "#44403c",
      "--cream-50": "#fffbf7",
      "--cream-100": "#faf6f0",
      "--cream-200": "#f5ebe0",
      "--sage-50": "#fff7ed",
      "--sage-100": "#ffedd5",
      "--sage-200": "#fed7aa",
      "--sage-400": "#fb923c",
      "--sage-600": "#ea580c",
      "--sage-700": "#c2410c",
      "--sage-800": "#9a3412",
      "--sage-900": "#7c2d12",
    },
  },
  {
    id: "sage",
    label: "Soft sage",
    swatch: "#4d7c62",
    vars: {
      "--background": "#f4f7f4",
      "--foreground": "#3d4f44",
      "--cream-50": "#f8fbf9",
      "--cream-100": "#f0f5f1",
      "--cream-200": "#e2ebe4",
      "--sage-50": "#eef6f0",
      "--sage-100": "#dcebe1",
      "--sage-200": "#b8d4c4",
      "--sage-400": "#6fa888",
      "--sage-600": "#4d7c62",
      "--sage-700": "#3d634f",
      "--sage-800": "#2f4d3d",
      "--sage-900": "#243b30",
    },
  },
  {
    id: "ocean",
    label: "Ocean blue",
    swatch: "#2563eb",
    vars: {
      "--background": "#f0f6ff",
      "--foreground": "#1e3a5f",
      "--cream-50": "#f8fbff",
      "--cream-100": "#eff6ff",
      "--cream-200": "#dbeafe",
      "--sage-50": "#eff6ff",
      "--sage-100": "#dbeafe",
      "--sage-200": "#bfdbfe",
      "--sage-400": "#60a5fa",
      "--sage-600": "#2563eb",
      "--sage-700": "#1d4ed8",
      "--sage-800": "#1e40af",
      "--sage-900": "#1e3a8a",
    },
  },
  {
    id: "slate",
    label: "Cool slate",
    swatch: "#475569",
    vars: {
      "--background": "#f1f5f9",
      "--foreground": "#334155",
      "--cream-50": "#f8fafc",
      "--cream-100": "#f1f5f9",
      "--cream-200": "#e2e8f0",
      "--sage-50": "#f8fafc",
      "--sage-100": "#e2e8f0",
      "--sage-200": "#cbd5e1",
      "--sage-400": "#64748b",
      "--sage-600": "#475569",
      "--sage-700": "#334155",
      "--sage-800": "#1e293b",
      "--sage-900": "#0f172a",
    },
  },
  {
    id: "rose",
    label: "Soft rose",
    swatch: "#e11d48",
    vars: {
      "--background": "#fff5f7",
      "--foreground": "#4c0519",
      "--cream-50": "#fff1f2",
      "--cream-100": "#ffe4e6",
      "--cream-200": "#fecdd3",
      "--sage-50": "#fff1f2",
      "--sage-100": "#ffe4e6",
      "--sage-200": "#fecdd3",
      "--sage-400": "#fb7185",
      "--sage-600": "#e11d48",
      "--sage-700": "#be123c",
      "--sage-800": "#9f1239",
      "--sage-900": "#881337",
    },
  },
];

export const DEFAULT_THEME_ID: ThemeId = "warm";

export function getThemePreset(id?: string | null): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0]!;
}
