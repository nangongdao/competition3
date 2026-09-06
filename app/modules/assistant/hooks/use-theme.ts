import { useCallback, useEffect, useState } from "react";

import {
  isThemePreference,
  parseStoredThemePreference,
  resolveThemeMode,
  THEME_STORAGE_KEY,
  type ThemeMode,
  type ThemePreference,
} from "@/modules/assistant/lib/theme";

export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function readSystemTheme(): ThemeMode {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_SCHEME_QUERY).matches
  ) {
    return "dark";
  }
  return "light";
}

function applyThemeAttribute(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", mode);
}

type ThemeController = {
  /** 用户偏好（三态） */
  preference: ThemePreference;
  /** 实际应用的主题（两态） */
  mode: ThemeMode;
  /** 当前是否为暗色（派生便捷判断） */
  isDark: boolean;
  setPreference: (preference: ThemePreference) => void;
  cyclePreference: () => void;
  /** 以规范化顺序遍历（system -> light -> dark） */
  preferences: readonly ThemePreference[];
};

const PREFERENCE_ORDER: readonly ThemePreference[] = ["system", "light", "dark"];

export function useTheme(): ThemeController {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => parseStoredThemePreference(
      // 惰性初始化时读取 localStorage；SSR 安全降级为默认
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(THEME_STORAGE_KEY),
    ),
  );
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(readSystemTheme);

  // 监听系统配色方案变化（仅在偏好为 system 时有意义）
  useEffect(() => {
    const media = window.matchMedia(DARK_SCHEME_QUERY);
    const handleChange = (event: MediaQueryListEvent): void => {
      setSystemTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  // 持久化偏好到 localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
    } catch {
      // 主题偏好是可选的；隐私模式与配额异常不应阻断会话。
    }
  }, [preference]);

  const mode = resolveThemeMode(preference, systemTheme);

  // 将解析后的主题应用到 <html data-theme>，驱动 CSS 语义层切换。
  useEffect(() => {
    applyThemeAttribute(mode);
  }, [mode]);

  const setPreference = useCallback((next: ThemePreference): void => {
    if (isThemePreference(next)) {
      setPreferenceState(next);
    }
  }, []);

  const cyclePreference = useCallback((): void => {
    setPreferenceState((current) => {
      const index = PREFERENCE_ORDER.indexOf(current);
      return PREFERENCE_ORDER[(index + 1) % PREFERENCE_ORDER.length];
    });
  }, []);

  return {
    preference,
    mode,
    isDark: mode === "dark",
    setPreference,
    cyclePreference,
    preferences: PREFERENCE_ORDER,
  };
}
