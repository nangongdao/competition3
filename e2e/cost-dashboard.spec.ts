import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — 成本驾驶舱独立页面（/costs）。
 *
 * 验证成本驾驶舱全屏视图：把「全局预算护栏 + 成本驾驶舱 + 预算历史审计 +
 * 全局累计用量 + 跨会话成本对比 + 成本告警中心」集中到一个页面。
 *
 * 数据全部来自 D1 持久化后端（预算 / 当月用量 / 按会话聚合 / 用量汇总 /
 * 预算历史）。mock `/api/sessions*` 系列端点返回既有数据，纯前端 + mock API，
 * 不依赖真实媒体/上游，可在 headless 下稳定运行。
 *
 * 覆盖路径：
 *   1. 直接访问 /costs 渲染驾驶舱页面骨架（标题 + 返回工作台入口）；
 *   2. 预算护栏 + 成本驾驶舱 + 预算历史 + 全局用量 + 跨会话对比面板同屏渲染；
 *   3. 侧边栏抽屉内的「成本驾驶舱」入口可导航到 /costs。
 */

const NOW = Date.now();

const SESSION = {
  id: "dash-session-1",
  title: "演示会话",
  providerMode: "chat",
  createdAt: NOW - 3_600_000,
  updatedAt: NOW - 10_000,
  messageCount: 1,
};

const USAGE_TOTALS = {
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

/** 安装成本驾驶舱所需 mock 后端。 */
function installCostDashboardMocks(page: Page): void {
  // Provider config：chat 模式 + 视觉支持。
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

  // 会话列表。
  const listBody = { success: true, sessions: [SESSION], total: 1, limit: 50, offset: 0 };
  void page.route("**/api/sessions?*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(listBody) }),
  );
  void page.route("**/api/sessions", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(listBody) }),
  );

  // 会话详情。
  void page.route(`**/api/sessions/${SESSION.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION, messages: [] },
      }),
    }),
  );
  void page.route(`**/api/sessions/${SESSION.id}/scene-memory`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, entries: [] }),
    }),
  );
  void page.route(`**/api/sessions/${SESSION.id}/usage`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, entries: [], totals: USAGE_TOTALS }),
    }),
  );

  // 全局预算护栏视图（含当月用量 + 预算历史 + 月末外推）。
  void page.route("**/api/sessions/usage/budget", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        budget: {
          monthlyBudgetUsd: 10,
          alertThresholdPct: 80,
          updatedAt: NOW,
        },
        month: {
          monthKey: "2026-08",
          turnCount: 12,
          estimatedCostUsd: 3.4,
          inputTokens: 22000,
          outputTokens: 4000,
        },
        monthSeries: [
          { day: 1, estimatedCostUsd: 0.1 },
          { day: 2, estimatedCostUsd: 0.2 },
          { day: 3, estimatedCostUsd: 0.3 },
          { day: 4, estimatedCostUsd: 0.4 },
          { day: 5, estimatedCostUsd: 0.5 },
          { day: 6, estimatedCostUsd: 0.6 },
          { day: 7, estimatedCostUsd: 0.7 },
          { day: 8, estimatedCostUsd: 0.8 },
        ],
        monthHistory: [
          { monthKey: "2026-08", estimatedCostUsd: 3.4, budgetUsd: 10, usedPct: 34 },
          { monthKey: "2026-07", estimatedCostUsd: 12.0, budgetUsd: 10, usedPct: 120 },
          { monthKey: "2026-06", estimatedCostUsd: 9.0, budgetUsd: 10, usedPct: 90 },
        ],
        usedPct: 34,
      }),
    }),
  );

  // 跨会话成本对比。
  void page.route("**/api/sessions/usage/by-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        total: 2,
        sessions: [
          {
            sessionId: SESSION.id,
            title: "演示会话",
            providerMode: "chat",
            turnCount: 8,
            inputTokens: 16000,
            outputTokens: 3200,
            estimatedCostUsd: 2.2,
            lastRecordedAt: NOW,
          },
          {
            sessionId: "dash-session-2",
            title: "旧会话",
            providerMode: "realtime",
            turnCount: 5,
            inputTokens: 12000,
            outputTokens: 6000,
            estimatedCostUsd: 1.1,
            lastRecordedAt: NOW - 3_600_000,
          },
        ],
      }),
    }),
  );

  // 全局累计用量。
  void page.route("**/api/sessions/usage/totals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, totals: { ...USAGE_TOTALS, turnCount: 13 } }),
    }),
  );
}

test("成本驾驶舱页面直接渲染整套成本治理面板 @smoke", async ({ page }) => {
  installCostDashboardMocks(page);

  await page.goto("/costs");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 顶部标题栏 + 返回工作台入口。
  await expect(
    page.getByRole("heading", { name: "Cost Cockpit" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByLabel("Back to workspace"),
  ).toBeVisible();

  // 预算护栏面板（月度预算护栏标题 + 已用/剩余/使用率）。
  await expect(page.getByText("Monthly budget guardrail", { exact: true })).toBeVisible();
  await expect(page.getByText("Spent", { exact: true }).first()).toBeVisible();

  // 成本驾驶舱面板 + 月末外推。
  await expect(page.getByText("Month-end projection", { exact: true })).toBeVisible();
  // 预算历史审计面板。
  await expect(page.getByText("Budget history (vs monthly budget)", { exact: true })).toBeVisible();
  // 全局累计用量面板。
  await expect(page.getByText("Cross-session usage", { exact: true })).toBeVisible();
  // 跨会话成本对比面板（含 mock 会话名）。
  await expect(
    page.getByLabel("Cross-session cost comparison").getByText("演示会话"),
  ).toBeVisible();
  // 成本告警中心铃铛。
  await expect(page.getByLabel(/Cost alerts/i).first()).toBeVisible();
});

test("会话侧边栏抽屉提供成本驾驶舱入口并可导航 @smoke", async ({ page }) => {
  installCostDashboardMocks(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  const sessionsButton = page.getByRole("button", { name: "Sessions" });
  await expect(sessionsButton).toBeVisible({ timeout: 15_000 });
  await sessionsButton.click();
  await expect(page.getByRole("dialog", { name: /sidebar/i })).toBeVisible();

  // 侧边栏抽屉中的「成本驾驶舱」入口链接。
  const entry = page.getByLabel("Cost Cockpit").first();
  await expect(entry).toBeVisible();
  await entry.click();

  // 导航到 /costs，驾驶舱标题出现。
  await expect(page).toHaveURL(/\/costs/);
  await expect(page.getByRole("heading", { name: "Cost Cockpit" })).toBeVisible({
    timeout: 15_000,
  });
});

test("已应用校准回写时驾驶舱趋势图标注实测区间 @smoke", async ({ page }) => {
  installCostDashboardMocks(page);
  // 覆盖跨会话成本对比，提供 ≥3 会话使驾驶舱趋势外推有效（实测区间才渲染）。
  void page.route("**/api/sessions/usage/by-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        total: 3,
        sessions: [
          {
            sessionId: SESSION.id,
            title: "演示会话",
            providerMode: "chat",
            turnCount: 8,
            inputTokens: 16000,
            outputTokens: 3200,
            estimatedCostUsd: 2.2,
            lastRecordedAt: NOW,
          },
          {
            sessionId: "dash-session-2",
            title: "旧会话",
            providerMode: "realtime",
            turnCount: 5,
            inputTokens: 12000,
            outputTokens: 6000,
            estimatedCostUsd: 1.1,
            lastRecordedAt: NOW - 3_600_000,
          },
          {
            sessionId: "dash-session-3",
            title: "第三会话",
            providerMode: "realtime",
            turnCount: 3,
            inputTokens: 8000,
            outputTokens: 2000,
            estimatedCostUsd: 0.6,
            lastRecordedAt: NOW - 7_200_000,
          },
        ],
      }),
    }),
  );

  // 预置已应用的校准回写（factor 1.5）。
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "assistant.calibration-writeback",
      JSON.stringify({
        applied: true,
        factor: 1.5,
        derivedAt: Date.now(),
        totalRelativeDeltaPct: 50,
      }),
    );
  });

  await page.goto("/costs");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 实测区间标注（data-measured-interval）在驾驶舱趋势外推中出现。
  const interval = page.locator("[data-measured-interval]");
  await expect(interval).toBeVisible({ timeout: 15_000 });
  await expect(interval).toContainText("Measured range (estimate vs actual)");
});

test("已应用校准回写时 /costs 显示校正提示徽标 @smoke", async ({ page }) => {
  installCostDashboardMocks(page);

  // 预置已应用的校准回写（factor 1.5），模拟用户此前在侧边栏一键回写。
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "assistant.calibration-writeback",
      JSON.stringify({
        applied: true,
        factor: 1.5,
        derivedAt: Date.now(),
        totalRelativeDeltaPct: 50,
      }),
    );
  });

  await page.goto("/costs");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 校正提示徽标（data-calibration-badge）出现，并标注校准系数。
  const badge = page.locator("[data-calibration-badge]");
  await expect(badge).toBeVisible({ timeout: 15_000 });
  await expect(badge).toContainText("Calibrated by writeback factor");
  await expect(badge).toContainText("1.50");
});
