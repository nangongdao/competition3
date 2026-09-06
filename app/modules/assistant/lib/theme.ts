import { z } from "zod";

/**
 * M2.2 暗色模式 —— 主题偏好。
 *
 * 三态偏好（system / light / dark）：
 *   - system：跟随操作系统 `prefers-color-scheme`
 *   - light / dark：用户手动锁定
 *
 * 解析后的实际主题只有两态（light / dark），由
 * `resolveThemeMode(preference, systemTheme)` 计算。
 */

export const THEME_STORAGE_KEY = "assistant-theme-preference-v1";

/** 用户偏好：system / light / dark 三态 */
export const themePreferenceSchema = z.enum(["system", "light", "dark"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

/** 解析后的实际主题：light / dark 两态 */
export const themeModeSchema = z.enum(["light", "dark"]);

export type ThemeMode = z.infer<typeof themeModeSchema>;

/** 系统 prefers-color-scheme 的媒体查询结果 */
export const systemThemeSchema = themeModeSchema;

export type SystemTheme = z.infer<typeof systemThemeSchema>;

export const defaultThemePreference: ThemePreference = "system";

export function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferenceSchema.safeParse(value).success === true;
}

/**
 * 将任意值解析为合法主题偏好，非法时回退到默认值。
 * 复用 workspace-layout 的 zod 校验模式。
 */
export function parseThemePreference(value: unknown): ThemePreference {
  const result = themePreferenceSchema.safeParse(value);
  return result.success === true ? result.data : defaultThemePreference;
}

/**
 * 解析 localStorage 中的主题偏好字符串。
 * 兼容 JSON 序列化（字符串直接就是偏好值，但仍做类型防护）。
 */
export function parseStoredThemePreference(
  value: string | null,
): ThemePreference {
  if (value === null) {
    return defaultThemePreference;
  }

  try {
    return parseThemePreference(JSON.parse(value) as unknown);
  } catch {
    return defaultThemePreference;
  }
}

/**
 * 根据偏好 + 系统主题，计算出最终应用的主题。
 *   - system  -> 跟随系统
 *   - light   -> 锁定浅色
 *   - dark    -> 锁定深色
 */
export function resolveThemeMode(
  preference: ThemePreference,
  systemTheme: SystemTheme,
): ThemeMode {
  if (preference === "system") {
    return systemTheme;
  }
  return preference;
}

/** 是否使用 `prefers-color-scheme: dark` 的媒体查询 */
export function isDarkSchemeMediaQuery(query: string): boolean {
  return query.includes("prefers-color-scheme: dark");
}
