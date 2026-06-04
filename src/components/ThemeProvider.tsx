"use client";

import { useEffect } from "react";
import { DEFAULT_THEME_ID, getThemePreset, type ThemeId } from "@/lib/theme/presets";
import { loadPreferences } from "@/lib/storage";

const STORAGE_KEY = "homivion-theme";

export function getStoredThemeId(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const fromPrefs = loadPreferences().colorTheme;
    if (fromPrefs) return fromPrefs;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && getThemePreset(raw).id === raw) return raw as ThemeId;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID;
}

export function applyTheme(id: ThemeId) {
  const preset = getThemePreset(id);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.vars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = id;
  localStorage.setItem(STORAGE_KEY, id);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(getStoredThemeId());
  }, []);

  return children;
}
