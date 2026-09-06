import { test, expect, type Page } from "@playwright/test";

/**
 * E2E 补强 — 用量面板/全局视图的服务商价格表回显。
 *
 * 在既有用量 E2E 基础上，补充对「provider 价格表」的端到端验证：
 *   - Chat 模式：`Chat usage` 面板展示视觉 Chat 单价（$2.50/1M 文本输入等）；
 *   - Realtime 模式：`Realtime usage` 面板展示 gpt-realtime 单价（含缓存费率）；
 *   - 全局视图：侧边栏「Global usage」面板同时列出 Realtime 与 Chat 两张价格表。
 *
 * 纯前端 + mock API，headless 可稳定运行。
 */

async function setLanguageEn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });
}

async function mockChatConfig(page: Page): Promise<void> {
  await setLanguageEn(page);
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
}

async function mockRealtimeWithSession(page: Page): Promise<void> {
  await setLanguageEn(page);
  const SESSION = {
    id: "sess-price",
    title: "Price table session",
    providerMode: "realtime",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    messageCount: 0,
  };
  const GLOBAL_TOTALS = {
    turnCount: 2,
    inputTokens: 3000,
    inputTextTokens: 500,
    inputAudioTokens: 2000,
    inputImageTokens: 500,
    cachedInputTokens: 100,
    cachedTextTokens: 50,
    cachedAudioTokens: 0,
    cachedImageTokens: 50,
    outputTokens: 200,
    outputTextTokens: 80,
    outputAudioTokens: 120,
    estimatedCostUsd: 0.0012,
  };

  await page.route("**/api/provider/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        providerMode: "realtime",
        visionCapability: "none",
      }),
    }),
  );
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
  await page.route("**/api/sessions/usage/totals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, totals: GLOBAL_TOTALS }),
    }),
  );
  await page.route(`**/api/sessions/${SESSION.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION, messages: [] },
      }),
    }),
  );
  await page.route(`**/api/sessions/${SESSION.id}/usage`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, entries: [], totals: null }),
    }),
  );
}

test("Chat 模式用量面板展示视觉 Chat 价格表 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // Chat 用量面板可见（aria-label = "Chat usage"）。
  const chatUsage = page.getByLabel("Chat usage");
  await expect(chatUsage).toBeVisible({ timeout: 15_000 });

  // 服务商价格表回显区出现。
  const priceTable = chatUsage.getByLabel("Provider prices");
  await expect(priceTable).toBeVisible();

  // 视觉 Chat 单价：文本输入 $2.50/1M、图像输入 $5.00/1M、文本输出 $10.00/1M。
  await expect(priceTable).toContainText("Vision Chat");
  await expect(priceTable).toContainText("$2.50/1M");
  await expect(priceTable).toContainText("$5.00/1M");
  await expect(priceTable).toContainText("$10.00/1M");

  // Chat 模式价格表无音频/缓存模态。
  await expect(priceTable).not.toContainText("Audio out");
});

test("Realtime 模式用量面板展示 gpt-realtime 价格表（含缓存费率） @smoke", async ({
  page,
}) => {
  await mockRealtimeWithSession(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  const realtimeUsage = page.getByLabel("Realtime usage");
  await expect(realtimeUsage).toBeVisible({ timeout: 15_000 });

  const priceTable = realtimeUsage.getByLabel("Provider prices");
  await expect(priceTable).toBeVisible();

  // gpt-realtime 单价：文本输入 $4.00/1M、音频输入 $32.00/1M、文本输出 $16.00/1M。
  await expect(priceTable).toContainText("Realtime (gpt-realtime)");
  await expect(priceTable).toContainText("$4.00/1M");
  await expect(priceTable).toContainText("$32.00/1M");
  await expect(priceTable).toContainText("$16.00/1M");

  // 缓存费率注释出现（cached rate）。
  await expect(priceTable).toContainText("cached rate");
});

test("全局视图列出 Realtime 与 Chat 两张价格表 @smoke", async ({ page }) => {
  await mockRealtimeWithSession(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 打开侧边栏 → 全局累计用量面板。
  await page.getByRole("button", { name: "Sessions" }).click();
  const globalPanel = page.getByLabel("Global usage");
  await expect(globalPanel).toBeVisible({ timeout: 15_000 });

  // 全局面板含价格表回显，且同时列出两种模式。
  const priceTable = globalPanel.getByLabel("Provider prices");
  await expect(priceTable).toBeVisible();
  await expect(priceTable).toContainText("Realtime (gpt-realtime)");
  await expect(priceTable).toContainText("Vision Chat");
  await expect(priceTable).toContainText("$4.00/1M"); // Realtime text input
  await expect(priceTable).toContainText("$2.50/1M"); // Chat text input
});
