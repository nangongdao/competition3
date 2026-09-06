import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/i18n/locales/en.json";
import zh from "@/i18n/locales/zh.json";

/** localStorage key 持久化用户语言偏好。 */
export const LANGUAGE_STORAGE_KEY = "app-language";

/** 支持的语言。 */
export const SUPPORTED_LANGUAGES = ["zh", "en"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * 读取用户语言偏好：
 * 1. localStorage 中显式选择的语言
 * 2. 浏览器 navigator.language（跟随系统）
 * 3. 回退到中文
 */
export function resolveInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "zh";
  }

  const stored = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === "zh" || stored === "en") {
    return stored;
  }

  const navigatorLang = window.navigator?.language?.toLowerCase() ?? "";
  if (navigatorLang.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

/**
 * 持久化语言偏好到 localStorage。
 */
export function persistLanguage(language: AppLanguage): void {
  if (typeof window === "undefined" || window.localStorage == null) {
    return;
  }
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false, // React 已处理 XSS 转义
  },
});

export default i18n;
