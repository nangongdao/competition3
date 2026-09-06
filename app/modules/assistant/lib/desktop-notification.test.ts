import { describe, expect, it, vi } from "vitest";

import {
  createNotificationAdapter,
  getNotificationPermission,
  requestNotificationPermission,
  shouldPromptNotificationPermission,
  showDesktopNotification,
} from "@/modules/assistant/lib/desktop-notification";

describe("desktop notification adapter", () => {
  it("uses injected overrides when provided", async () => {
    const shown: { title: string; body?: string; onClick?: () => void }[] = [];
    const adapter = createNotificationAdapter({
      permission: () => "granted",
      requestPermission: async () => "granted",
      show: (title, body, onClick) => {
        shown.push({ title, body, onClick });
      },
    });

    expect(getNotificationPermission(adapter)).toBe("granted");
    expect(await requestNotificationPermission(adapter)).toBe("granted");
    showDesktopNotification({ title: "Hi", body: "Body" }, adapter);
    expect(shown).toEqual([{ title: "Hi", body: "Body", onClick: undefined }]);
  });

  it("does not fire notification when permission is not granted", () => {
    const show = vi.fn();
    const adapter = createNotificationAdapter({
      permission: () => "denied",
      show,
    });
    showDesktopNotification({ title: "Ignored" }, adapter);
    expect(show).not.toHaveBeenCalled();
  });

  it("prompts guidance only when permission is default or unsupported", () => {
    const granted = createNotificationAdapter({ permission: () => "granted" });
    const denied = createNotificationAdapter({ permission: () => "denied" });
    const neutral = createNotificationAdapter({ permission: () => "default" });
    const unsupported = createNotificationAdapter({ permission: () => "unsupported" });

    expect(shouldPromptNotificationPermission(granted)).toBe(false);
    expect(shouldPromptNotificationPermission(denied)).toBe(false);
    expect(shouldPromptNotificationPermission(neutral)).toBe(true);
    expect(shouldPromptNotificationPermission(unsupported)).toBe(true);
  });
});
