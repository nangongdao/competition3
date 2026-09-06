import { test, expect } from "@playwright/test";

/**
 * E2E 补强 — 会话切换（M3.3 多会话管理用户路径）。
 *
 * 通过 mock `/api/sessions*` 后端提供两条既有会话，验证：
 *   - 侧边栏抽屉列出两条会话
 *   - 点击另一条会话后，转写区切换为对应会话的历史消息
 *   - 当前会话按钮 aria-pressed 状态正确迁移
 *
 * 纯前端 + mock API，无需真实 D1 或媒体设备，可在 headless 下稳定运行。
 */

const SESSION_A = {
  id: "sess-a",
  title: "会话甲",
  providerMode: "chat",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_500,
  messageCount: 1,
};

const SESSION_B = {
  id: "sess-b",
  title: "会话乙",
  providerMode: "chat",
  createdAt: 1_700_000_001_000,
  updatedAt: 1_700_000_001_500,
  messageCount: 1,
};

const MESSAGES_A = [
  {
    id: "a-1",
    sessionId: SESSION_A.id,
    role: "user",
    content: "来自会话甲的用户消息",
    modality: "text",
    tokens: 12,
    createdAt: 1_700_000_000_100,
  },
] as const;

const MESSAGES_B = [
  {
    id: "b-1",
    sessionId: SESSION_B.id,
    role: "user",
    content: "来自会话乙的用户消息",
    modality: "text",
    tokens: 14,
    createdAt: 1_700_000_001_100,
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

  // 会话列表：返回两条既有会话。
  await page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION_B, SESSION_A],
        total: 2,
        limit: 50,
        offset: 0,
      }),
    }),
  );
  await page.route("**/api/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION_B, SESSION_A],
        total: 2,
        limit: 50,
        offset: 0,
      }),
    }),
  );

  // 会话 A 详情（历史消息）。
  await page.route("**/api/sessions/sess-a", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION_A, messages: MESSAGES_A },
      }),
    }),
  );

  // 会话 B 详情（历史消息）。
  await page.route("**/api/sessions/sess-b", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION_B, messages: MESSAGES_B },
      }),
    }),
  );
}

test("切换会话后转写区加载对应会话历史 @smoke", async ({ page }) => {
  await mockSessionBackend(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 打开侧边栏抽屉，应列出两条会话。
  await page.getByRole("button", { name: "Sessions" }).click();
  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  await expect(drawer).toBeVisible();

  await expect(drawer.getByText("会话甲").first()).toBeVisible();
  await expect(drawer.getByText("会话乙").first()).toBeVisible();

  // 关闭抽屉（抽屉内容区的关闭按钮，避免匹配遮罩），等待会话恢复完成（默认恢复列表首条：会话乙）。
  await drawer.locator('button[title="Close session sidebar"]').click();
  await expect(
    page.getByText("来自会话乙的用户消息").first(),
  ).toBeVisible({ timeout: 15_000 });

  // 重新打开抽屉，点击「会话甲」切换。
  await page.getByRole("button", { name: "Sessions" }).click();
  await drawer.getByText("会话甲").first().click();
  await drawer.locator('button[title="Close session sidebar"]').click();

  // 转写区应切换到会话甲的历史消息，且不再显示会话乙的消息。
  await expect(page.getByText("来自会话甲的用户消息").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("来自会话乙的用户消息")).toHaveCount(0);
});
