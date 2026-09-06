import { test, expect, type Page } from "@playwright/test";

/**
 * M10.8 E2E — 全局命令面板（Ctrl/Cmd + K）。
 *
 * 验证键盘驱动的统一交互入口：
 *   1. Ctrl+K 打开命令面板（搜索框 + 分组命令列表）；
 *   2. 输入关键词过滤命令（如“成本”）；
 *   3. 回车执行“成本驾驶舱”命令 → 导航到 /costs；
 *   4. Esc 关闭面板。
 *
 * 数据依赖：mock provider config 让工作台正常渲染；/costs 用既有
 * cost-dashboard mock 保证导航目标页可稳定渲染。
 */

function installProviderConfigMock(page: Page): void {
  void page.route("**/api/provider/config", (route) =>
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

/** 安装 /costs 驾驶舱所需 mock（沿用 cost-dashboard.spec 约定）。 */
function installCostDashboardMocks(page: Page): void {
  const now = Date.now();
  const session = {
    id: "cp-session-1",
    title: "演示会话",
    providerMode: "chat",
    createdAt: now - 3_600_000,
    updatedAt: now - 10_000,
    messageCount: 1,
  };
  const usageTotals = {
    turnCount: 13,
    inputTokens: 1800,
    inputTextTokens: 1740,
    inputAudioTokens: 0,
    inputImageTokens: 60,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: 350,
    outputTextTokens: 350,
    outputAudioTokens: 0,
    estimatedCostUsd: 0.06,
  };
  void page.route("**/api/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [session] }),
    }),
  );
  void page.route("**/api/sessions/usage/totals*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: usageTotals }),
    }),
  );
  void page.route("**/api/sessions/usage/by-session*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    }),
  );
  void page.route("**/api/sessions/usage/budget*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: null }),
    }),
  );
}

test("Ctrl+K 打开命令面板并搜索过滤 @smoke", async ({ page }) => {
  installProviderConfigMock(page);
  await page.goto("/");

  // 等待工作台挂载。
  await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });

  // Ctrl+K 打开面板。
  await page.keyboard.press("Control+k");
  const palette = page.locator('[data-command-palette-open="true"]');
  await expect(palette).toBeVisible({ timeout: 10_000 });

  // 输入“成本”过滤命令。
  const input = page.locator('[data-command-palette-input="true"]');
  await input.fill("成本");

  // “成本驾驶舱”导航命令出现。
  await expect(
    page.locator('[data-command-id="nav-costs"]'),
  ).toBeVisible();

  // Esc 关闭面板。
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden({ timeout: 10_000 });
});

test("命令面板回车执行成本驾驶舱导航 @smoke", async ({ page }) => {
  installProviderConfigMock(page);
  installCostDashboardMocks(page);
  await page.goto("/");

  await expect(page.locator("nav").first()).toBeVisible({ timeout: 15_000 });

  // 打开面板并搜索“驾驶舱”。
  await page.keyboard.press("Control+k");
  const input = page.locator('[data-command-palette-input="true"]');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.fill("驾驶舱");

  const costsItem = page.locator('[data-command-id="nav-costs"]');
  await expect(costsItem).toBeVisible();

  // 回车执行 → 导航到 /costs。
  await page.keyboard.press("Enter");

  // 成本驾驶舱标题可见（校验导航成功 + 面板关闭）。
  await expect(
    page.locator('[data-command-palette-open="true"]'),
  ).toBeHidden({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/costs/);
  await expect(
    page.locator("text=/Cost Cockpit|成本驾驶舱/i").first(),
  ).toBeVisible({ timeout: 15_000 });
});
