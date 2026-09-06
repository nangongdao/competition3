import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — 校准偏差自动回写估算单价（calibration writeback）。
 *
 * mock `/api/sessions*` 系列端点返回既有数据（与成本管理三面板 E2E 同套），并在
 * localStorage 预置一条「估算 vs 实测偏差超过 10%」的校准样本。打开会话侧边栏抽屉后
 * 验证校准面板：
 *   - 展示「自动回写校正估算单价」入口（需校准且尚未回写）；
 *   - 点击回写后展示「校正后估算」+ 原始估算 + 重置入口；
 *   - 重置回写后恢复原始估算、入口重新出现。
 *
 * 纯前端 + mock API，headless 可稳定运行。
 */

const NOW = Date.now();

const SESSION = {
  id: "cal-session-1",
  title: "校准会话",
  providerMode: "chat",
  createdAt: NOW - 3_600_000,
  updatedAt: NOW - 10_000,
  messageCount: 1,
};

const MESSAGES = [
  {
    id: "msg-1",
    sessionId: SESSION.id,
    role: "user",
    content: "hello",
    modality: "text",
    tokens: 5,
    createdAt: NOW - 3_000_000,
  },
];

const USAGE_TOTALS = {
  turnCount: 3,
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

// 预置校准样本：估算 0.1 USD vs 实测 0.25 USD → 偏差 +150%（>10% 需校准）。
const CALIBRATION_SAMPLES = [
  {
    label: "session-1",
    estimatedUsd: 0.1,
    measuredUsd: 0.25,
    recordedAt: 1_700_000_000_000,
  },
];

function installMocks(page: Page, applyWriteback: boolean): void {
  void page.addInitScript(
    ({ samples, preApplied }) => {
      window.localStorage.setItem("app-language", "en");
      window.localStorage.setItem(
        "assistant.calibration-samples",
        JSON.stringify(samples),
      );
      if (preApplied) {
        window.localStorage.setItem(
          "assistant.calibration-writeback",
          JSON.stringify({
            applied: true,
            factor: 2.5,
            derivedAt: 1_700_000_000_000,
            totalRelativeDeltaPct: 150,
          }),
        );
      } else {
        window.localStorage.removeItem("assistant.calibration-writeback");
      }
    },
    { samples: CALIBRATION_SAMPLES, preApplied: applyWriteback },
  );

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

  const listBody = {
    success: true,
    sessions: [SESSION],
    total: 1,
    limit: 50,
    offset: 0,
  };
  void page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(listBody),
    }),
  );
  void page.route("**/api/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(listBody),
    }),
  );
  void page.route(`**/api/sessions/${SESSION.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION, messages: MESSAGES },
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
          monthKey: "2026-01",
          turnCount: 0,
          estimatedCostUsd: 0,
          inputTokens: 0,
          outputTokens: 0,
        },
        usedPct: 0,
        monthSeries: [],
        monthHistory: [],
      }),
    }),
  );
  void page.route("**/api/sessions/usage/by-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        total: 0,
        sessions: [],
      }),
    }),
  );
  void page.route(`**/api/sessions/${SESSION.id}/usage`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        entries: [],
        totals: USAGE_TOTALS,
      }),
    }),
  );
  void page.route("**/api/sessions/usage/totals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        totals: USAGE_TOTALS,
      }),
    }),
  );
}

async function openDrawer(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);
  const sessionsButton = page.getByRole("button", { name: "Sessions" });
  await expect(sessionsButton).toBeVisible({ timeout: 15_000 });
  await sessionsButton.click();
  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  await expect(drawer).toBeVisible({ timeout: 15_000 });
}

/** 滚动会话侧边栏抽屉的可滚动内容区到底部，使底部校准面板可交互。 */
async function scrollDrawerToBottom(drawer: ReturnType<Page["getByRole"]>): Promise<void> {
  await drawer
    .locator("[aria-label='Session list (scrollable)']")
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  await drawer.evaluate(() => {
    // 兜底：滚动抽屉内所有可滚动容器到底部。
    document.querySelectorAll(".overflow-y-auto").forEach((node) => {
      node.scrollTop = node.scrollHeight;
    });
  });
}

test("校准偏差超过阈值时展示自动回写入口并应用回写校正估算 @smoke", async ({
  page,
}) => {
  installMocks(page, false);
  await openDrawer(page);

  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  await scrollDrawerToBottom(drawer);
  const calibrationPanel = drawer.getByLabel("Cost calibration (estimate vs actual)");
  await expect(calibrationPanel).toBeVisible({ timeout: 15_000 });

  // 需校准（偏差 +150% > 10%）→ 展示自动回写入口。
  const applyButton = calibrationPanel.locator("[data-calibration-writeback-apply]");
  await expect(applyButton).toBeVisible();
  await expect(applyButton).toHaveText(/Apply correction to estimated price/);

  // 点击回写 → 展示校正态（校正后估算 + 重置入口），自动回写入口消失。
  await applyButton.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    (el as HTMLButtonElement).click();
  });
  await expect(
    calibrationPanel.locator("[data-calibration-writeback-active]"),
  ).toBeVisible();
  const resetButton = calibrationPanel.locator(
    "[data-calibration-writeback-reset]",
  );
  await expect(resetButton).toBeVisible();
  await expect(
    calibrationPanel.locator("[data-calibration-writeback-apply]"),
  ).toHaveCount(0);
});

test("重置校准回写后恢复原始估算并重新出现自动回写入口 @smoke", async ({
  page,
}) => {
  installMocks(page, true);
  await openDrawer(page);

  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  await scrollDrawerToBottom(drawer);
  const calibrationPanel = drawer.getByLabel("Cost calibration (estimate vs actual)");
  await expect(calibrationPanel).toBeVisible({ timeout: 15_000 });

  // 已回写 → 展示校正态，无自动回写入口。
  await expect(
    calibrationPanel.locator("[data-calibration-writeback-active]"),
  ).toBeVisible();
  const resetButton = calibrationPanel.locator(
    "[data-calibration-writeback-reset]",
  );
  await expect(resetButton).toBeVisible();
  await expect(
    calibrationPanel.locator("[data-calibration-writeback-apply]"),
  ).toHaveCount(0);

  // 重置 → 恢复原始估算，自动回写入口重新出现。
  await resetButton.evaluate((el) => {
    el.scrollIntoView({ block: "center", inline: "nearest" });
    (el as HTMLButtonElement).click();
  });
  await expect(
    calibrationPanel.locator("[data-calibration-writeback-active]"),
  ).toHaveCount(0);
  await expect(
    calibrationPanel.locator("[data-calibration-writeback-apply]"),
  ).toBeVisible();
});
