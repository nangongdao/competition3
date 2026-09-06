import { test, expect } from "@playwright/test";

/**
 * M5 E2E 补强 — 会话持久化 / 恢复（M3.2 / M3.3）。
 *
 * 通过 mock /api/sessions* 后端，验证刷新后历史会话与消息被恢复：
 *   - 首次加载列出最近会话并恢复最近一个会话的消息
 *   - 恢复的用户 / 助手消息出现在转写区
 *
 * 纯前端 + mock API，无需真实 D1 或媒体设备，可在 headless 下稳定运行。
 */

const SESSION = {
  id: "sess-001",
  title: "历史会话",
  providerMode: "chat",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  messageCount: 2,
};

const MESSAGES = [
  {
    id: "m-1",
    sessionId: SESSION.id,
    role: "user",
    content: "帮我看看画面里的物体",
    modality: "text",
    tokens: 12,
    createdAt: 1_700_000_000_100,
  },
  {
    id: "m-2",
    sessionId: SESSION.id,
    role: "assistant",
    content: "我看到画面里有一只橘色的猫",
    modality: "text",
    tokens: 20,
    createdAt: 1_700_000_000_200,
  },
] as const;

async function mockSessionBackend(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });

  await page.route("**/api/provider/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        providerMode: "chat",
        visionCapability: "multi-image",
      }),
    }),
  );

  // 会话列表：返回一个历史会话
  await page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }),
  );

  // 恢复最近会话详情：返回历史消息
  await page.route(`**/api/sessions/${SESSION.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION, messages: MESSAGES },
      }),
    }),
  );
}

test("刷新后恢复历史会话与消息 @smoke", async ({ page }) => {
  await mockSessionBackend(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 用户历史消息被恢复到转写区
  await expect(page.getByText("帮我看看画面里的物体").first()).toBeVisible({
    timeout: 15_000,
  });

  // 助手历史回复被恢复
  await expect(page.getByText("我看到画面里有一只橘色的猫").first()).toBeVisible({
    timeout: 15_000,
  });
});
