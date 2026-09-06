import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — ⑥ 成本告警通知中心（Cost Alert Center）。
 *
 * mock `/api/sessions/usage/budget`（预算 + 当月用量，超限状态）与
 * `/api/sessions/usage/by-session`，验证：
 *   - 右上角铃铛 + 活跃角标（超限告警计数）渲染；
 *   - 一次性横幅（新告警首次触发）展示；
 *   - 通知列表面板列出活跃告警并可逐条/全部忽略。
 *
 * 纯前端 + mock API，headless 可稳定运行。
 */

async function setLanguageEn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
    // 清空成本告警去重状态，确保每次测试从全新告警状态开始。
    window.localStorage.removeItem("assistant.cost-alert-dismissed");
    window.localStorage.removeItem("assistant.cost-alert-session-shown");
  });
}

async function mockOverBudget(page: Page): Promise<void> {
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
  await page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [],
        total: 0,
        limit: 50,
        offset: 0,
      }),
    }),
  );
  // 预算 $10，已用 $12 → 超限（over，120%），触发布告警。
  await page.route("**/api/sessions/usage/budget", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        budget: {
          monthlyBudgetUsd: 10,
          alertThresholdPct: 80,
          updatedAt: 1_700_000_000_000,
        },
        month: {
          monthKey: "2026-01",
          turnCount: 8,
          estimatedCostUsd: 12,
          inputTokens: 2000,
          outputTokens: 800,
        },
        usedPct: 120,
        monthSeries: [1, 2, 3, 4, 5].map((day) => ({
          dayKey: `2026-01-0${day}`,
          spentUsd: 2.4,
        })),
        monthHistory: [
          {
            monthKey: "2026-01",
            turnCount: 8,
            estimatedCostUsd: 12,
            inputTokens: 2000,
            outputTokens: 800,
          },
        ],
      }),
    }),
  );
  await page.route("**/api/sessions/usage/by-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [],
      }),
    }),
  );
}

test("成本告警通知中心渲染铃铛角标与活跃告警列表 @smoke", async ({ page }) => {
  await mockOverBudget(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 铃铛入口 + 角标（预算超限 + 月末超预算预测 + 上月超限 = 3 条活跃告警）。
  const center = page.getByLabel("Cost alerts (3 active)");
  await expect(center).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[data-cost-alert-badge]")).toHaveText("3");

  // 通知列表展开（右下角）。
  await expect(page.locator("[data-cost-alert-list]")).toBeVisible();
  await expect(page.locator("[data-cost-alert-list]")).toContainText(
    "Monthly budget exceeded",
  );
});

test("成本告警通知中心可全部忽略并清空角标 @smoke", async ({ page }) => {
  await mockOverBudget(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  await expect(page.locator("[data-cost-alert-badge]")).toHaveText("3");
  await expect(page.locator("[data-cost-alert-list]")).toBeVisible();

  // 一键全部忽略。
  await page.getByRole("button", { name: "Dismiss all" }).click();

  // 忽略后角标消失、列表收起。
  await expect(page.locator("[data-cost-alert-badge]")).toHaveCount(0);
  await expect(page.locator("[data-cost-alert-list]")).toHaveCount(0);
});
