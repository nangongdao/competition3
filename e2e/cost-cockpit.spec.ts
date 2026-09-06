import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — ④ 全局成本看板（成本驾驶舱）。
 *
 * mock `/api/sessions/usage/budget`（预算 + 当月用量）与
 * `/api/sessions/usage/by-session`（按会话聚合），验证侧边栏成本驾驶舱：
 *   - 渲染全局预算护栏摘要（已用/剩余/使用率）；
 *   - 标注超限 / 接近阈值会话（over-budget / approaching）；
 *   - 基于会话成本给出趋势外推（预测 / 增量）。
 *
 * 纯前端 + mock API，headless 可稳定运行。
 */

async function setLanguageEn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });
}

async function mockCostCockpit(page: Page): Promise<void> {
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
  // 预算 + 当月用量（已用 $11，预算 $15 → 使用率 73.3%）。
  await page.route("**/api/sessions/usage/budget", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        budget: {
          monthlyBudgetUsd: 15,
          alertThresholdPct: 80,
          updatedAt: 1_700_000_000_000,
        },
        month: {
          monthKey: "2026-01",
          turnCount: 5,
          estimatedCostUsd: 11,
          inputTokens: 1000,
          outputTokens: 500,
        },
        usedPct: 73.33333333333333,
        // 当月逐日消费序列（供驾驶舱月度前瞻预测）。平缓消费使月底预测可控（on-track）。
        monthSeries: [1, 2, 3, 4, 5].map((day) => ({
          dayKey: `2026-01-0${day}`,
          spentUsd: 0.6,
        })),
        // 最近 6 个月逐月消费（供预算历史审计）。2025-12 超限、2025-11 趋紧。
        monthHistory: [
          {
            monthKey: "2026-01",
            turnCount: 5,
            estimatedCostUsd: 11,
            inputTokens: 1000,
            outputTokens: 500,
          },
          {
            monthKey: "2025-12",
            turnCount: 8,
            estimatedCostUsd: 17,
            inputTokens: 1600,
            outputTokens: 700,
          },
          {
            monthKey: "2025-11",
            turnCount: 6,
            estimatedCostUsd: 13,
            inputTokens: 1200,
            outputTokens: 600,
          },
        ],
      }),
    }),
  );
  // 按会话聚合（成本降序）。
  await page.route("**/api/sessions/usage/by-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [
          {
            sessionId: "sess-a",
            title: "Over session",
            providerMode: "chat",
            turnCount: 3,
            inputTokens: 600,
            outputTokens: 200,
            estimatedCostUsd: 6,
            lastRecordedAt: 1_700_000_000_000,
          },
          {
            sessionId: "sess-b",
            title: "Approach session",
            providerMode: "chat",
            turnCount: 2,
            inputTokens: 400,
            outputTokens: 150,
            estimatedCostUsd: 4,
            lastRecordedAt: 1_700_000_000_000,
          },
          {
            sessionId: "sess-c",
            title: "Normal session",
            providerMode: "chat",
            turnCount: 1,
            inputTokens: 100,
            outputTokens: 50,
            estimatedCostUsd: 1,
            lastRecordedAt: 1_700_000_000_000,
          },
        ],
        total: 3,
      }),
    }),
  );
  // 全局用量累计（空，避免额外干扰）。
  await page.route("**/api/sessions/usage/totals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        totals: {
          turnCount: 6,
          inputTokens: 1100,
          inputTextTokens: 500,
          inputAudioTokens: 0,
          inputImageTokens: 600,
          cachedInputTokens: 0,
          cachedTextTokens: 0,
          cachedAudioTokens: 0,
          cachedImageTokens: 0,
          outputTokens: 400,
          outputTextTokens: 400,
          outputAudioTokens: 0,
          estimatedCostUsd: 11,
        },
      }),
    }),
  );
}

test("成本驾驶舱渲染预算护栏与超限/接近阈值会话标注 @smoke", async ({
  page,
}) => {
  await mockCostCockpit(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 打开侧边栏。
  await page.getByRole("button", { name: "Sessions" }).click();
  const cockpit = page.getByLabel("Global Cost Cockpit");
  await expect(cockpit).toBeVisible({ timeout: 15_000 });

  // 预算护栏摘要（已用 $11 / 剩余 $4 / 使用率 73.3%）。
  await expect(cockpit.getByText("$11.0000").first()).toBeVisible();
  await expect(cockpit.getByText("$4.0000").first()).toBeVisible();
  await expect(cockpit.getByText("73.3%")).toBeVisible();

  // 超限 / 接近阈值会话计数。
  await expect(cockpit.getByLabel("1 over budget")).toBeVisible();
  await expect(cockpit.getByLabel("1 approaching threshold")).toBeVisible();

  // 逐会话超限 / 接近标注。
  await expect(cockpit).toContainText("Over session");
  await expect(cockpit).toContainText("Approach session");
  await expect(cockpit).toContainText("Normal session");
  await expect(cockpit.getByText("over", { exact: true })).toHaveCount(1);
  await expect(cockpit.getByText("approach", { exact: true })).toHaveCount(1);
});

test("成本驾驶舱基于会话成本给出趋势外推 @smoke", async ({ page }) => {
  await mockCostCockpit(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  await page.getByRole("button", { name: "Sessions" }).click();
  const cockpit = page.getByLabel("Global Cost Cockpit");
  await expect(cockpit).toBeVisible({ timeout: 15_000 });

  // 趋势外推区（forecast）。
  const forecast = cockpit.getByLabel("Cost Cockpit Trend Forecast");
  await expect(forecast).toBeVisible();

  // 当前累计成本 $11、预测高于当前（增量 > 0）→ 存在外推文案。
  await expect(forecast.getByText("$11.0000")).toBeVisible();
  await expect(forecast).toContainText("Linear extrapolation");
});

test("成本驾驶舱渲染月末前瞻预测（month-end forecast）@smoke", async ({
  page,
}) => {
  await mockCostCockpit(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  await page.getByRole("button", { name: "Sessions" }).click();
  const cockpit = page.getByLabel("Global Cost Cockpit");
  await expect(cockpit).toBeVisible({ timeout: 15_000 });

  // 月末前瞻预测区块（基于当月逐日消费序列）。
  const monthForecast = cockpit.getByLabel("Cost Cockpit Month-end Forecast");
  await expect(monthForecast).toBeVisible();

  // 当月累计消费 $11，上升趋势 → 预计月底花费 > $11（增量 > 0）。
  const projected = monthForecast.getByText("Projected month-end spend");
  await expect(projected).toBeVisible();
  // 状态徽标（本项目 mock 下预算充足 → on track）。
  await expect(monthForecast).toContainText("on track");
  // 剩余天数说明。
  await expect(monthForecast).toContainText("days left");
});

test("预算历史审计面板渲染历史月份消费 vs 预算 @smoke", async ({ page }) => {
  await mockCostCockpit(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  await page.getByRole("button", { name: "Sessions" }).click();
  const history = page.getByLabel("Budget history audit");
  await expect(history).toBeVisible({ timeout: 15_000 });

  // 摘要：3 个月覆盖，2025-12 超限（17 > 15 预算），2025-11 趋紧（13 ≥ 80%）。
  await expect(history.getByLabel("1 mo over")).toBeVisible();
  await expect(history.getByLabel("1 mo near")).toBeVisible();

  // 逐月条目（最新在上）：2026-01 → 2025-12（over）→ 2025-11（near）。
  await expect(history.getByText("2026-01")).toBeVisible();
  await expect(history.getByText("2025-12")).toBeVisible();
  await expect(history.getByText("2025-11")).toBeVisible();
  // 超限 / 趋紧状态徽标。
  await expect(history.getByText("over", { exact: true })).toBeVisible();
  await expect(history.getByText("near", { exact: true })).toBeVisible();
  // 历史消费金额。
  await expect(history.getByText("$17.0000").first()).toBeVisible();
});
