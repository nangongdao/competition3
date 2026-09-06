/**
 * 桌面通知集成（desktop notifications）。
 *
 * 通过标准 Web Notifications API（`window.Notification`）在桌面端与浏览器端
 * 统一弹出系统通知。在 Tauri 原生桌面中，Webview 里的 Notification 会桥接到
 * 操作系统通知中心；在纯浏览器中同样工作（首次需授权）。
 *
 * 提供：
 *   - `NotificationPermission`：权限状态（denied / granted / default / unsupported）；
 *   - `requestNotificationPermission`：请求权限（返回最新状态）；
 *   - `showDesktopNotification`：发送一条通知，做权限与能力守卫。
 *
 * 纯函数 + 注入式依赖，便于单测（可传入伪造的 Notification 实现）。
 */

export type NotificationPermission = "granted" | "denied" | "default" | "unsupported";

export type DesktopNotificationOptions = {
  title: string;
  body?: string;
  /** 通知点击后的跳转（可选）。 */
  onClick?: () => void;
};

export type NotificationFactory = {
  requestPermission: () => Promise<NotificationPermission>;
  permission: () => NotificationPermission;
  show: (title: string, body?: string, onClick?: () => void) => void;
};

function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function normalizePermission(value: string | undefined): NotificationPermission {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "default";
}

/**
 * 创建一个「通知适配器」，把平台差异封装在内部，方便注入测试与切换。
 * 默认从全局 `window.Notification` 读取；可通过 `overrides` 替换。
 */
export function createNotificationAdapter(
  overrides?: Partial<NotificationFactory>,
): NotificationFactory {
  if (overrides !== undefined) {
    return {
      requestPermission:
        overrides.requestPermission ?? (async () => "default"),
      permission: overrides.permission ?? (() => "default"),
      show: overrides.show ?? (() => undefined),
    };
  }

  return {
    async requestPermission() {
      if (!isNotificationSupported()) {
        return "unsupported";
      }
      try {
        const state = await Notification.requestPermission();
        return normalizePermission(state);
      } catch {
        return "default";
      }
    },
    permission() {
      if (!isNotificationSupported()) {
        return "unsupported";
      }
      return normalizePermission(Notification.permission);
    },
    show(title, body, onClick) {
      if (!isNotificationSupported() || Notification.permission !== "granted") {
        return;
      }
      try {
        const notification = new Notification(title, { body });
        if (onClick !== undefined) {
          notification.onclick = () => onClick();
        }
      } catch {
        // 通知创建失败（如系统限制）静默忽略，不影响主流程。
      }
    },
  };
}

/** 读取当前通知权限。 */
export function getNotificationPermission(adapter = createNotificationAdapter()): NotificationPermission {
  return adapter.permission();
}

/** 请求通知权限，返回请求后的最新状态。 */
export async function requestNotificationPermission(
  adapter = createNotificationAdapter(),
): Promise<NotificationPermission> {
  return adapter.requestPermission();
}

/** 发送一条桌面通知（带权限守卫）。 */
export function showDesktopNotification(
  options: DesktopNotificationOptions,
  adapter = createNotificationAdapter(),
): void {
  if (adapter.permission() !== "granted") {
    return;
  }
  adapter.show(options.title, options.body, options.onClick);
}

/** 是否需要在 UI 上引导用户开启通知（default 且受支持）。 */
export function shouldPromptNotificationPermission(adapter = createNotificationAdapter()): boolean {
  const permission = adapter.permission();
  return permission === "default" || permission === "unsupported";
}
