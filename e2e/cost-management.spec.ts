import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — 成本管理三面板（PR #97 新增）：
 *   ① 全局预算护栏（Cross-session budget guardrail）
 *   ② 成本趋势外推/预测（Cost trend forecast）
 *   ③ 跨会话成本对比（Cross-session cost comparison）
 *
 * 三个面板渲染在会话侧边栏抽屉（Sessions → Session sidebar）底部。
 * 数据全部来自 D1 持久化后端（预算配置 / 当月用量 / 按会话聚合 / 会话级用量记录）。
 * mock `/api/sessions*` 系列端点返回既有数据，纯前端 + mock API，
 * 不依赖真实媒体/上游，可在 headless 下稳定运行。
 *
 * 覆盖路径：
 *   1. 侧边栏渲染全局预算护栏（已用/剩余/使用率 + 进度条）；
 *   2. 预算护栏告警（warn 阈值 → 出现告警文案）；
 *   3. 成本预测面板（当前/预测/增量 + 外推图）；
 *   4. 跨会话成本对比面板（按会话成本条形 + 汇总）。
 */

const NOW = Date.now();

// 单条持久化会话（侧边栏列表 + 会话详情）。
const SESSION = {
  id: "cost-session-1",
  title: "演示会话",
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
    content: "帮我看看桌上的东西",
    modality: "text",
    tokens: 8,
    createdAt: NOW - 3_000_000,
  },
  {
    id: "msg-2",
    sessionId: SESSION.id,
    role: "assistant",
    content: "这是一台笔记本。",
    modality: "text",
    tokens: 15,
    createdAt: NOW - 2_800_000,
  },
];

// 会话级用量记录（≥3 条，满足线性回归最小样本 → 预测有效）。
const USAGE_ENTRIES = [
  {
    id: "u-1",
    sessionId: SESSION.id,
    mode: "chat",
    inputTokens: 500,
    inputTextTokens: 480,
    inputAudioTokens: 0,
    inputImageTokens: 20,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: 80,
    outputTextTokens: 80,
    outputAudioTokens: 0,
    estimatedCostUsd: 0.01,
    recordedAt: NOW - 3_000_000,
  },
  {
    id: "u-2",
    sessionId: SESSION.id,
    mode: "chat",
    inputTokens: 600,
    inputTextTokens: 580,
    inputAudioTokens: 0,
    inputImageTokens: 20,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: 120,
    outputTextTokens: 120,
    outputAudioTokens: 0,
    estimatedCostUsd: 0.02,
    recordedAt: NOW - 2_000_000,
  },
  {
    id: "u-3",
    sessionId: SESSION.id,
    mode: "chat",
    inputTokens: 700,
    inputTextTokens: 680,
    inputAudioTokens: 0,
    inputImageTokens: 20,
    cachedInputTokens: 0,
    cachedTextTokens: 0,
    cachedAudioTokens: 0,
    cachedImageTokens: 0,
    outputTokens: 150,
    outputTextTokens: 150,
    outputAudioTokens: 0,
    estimatedCostUsd: 0.03,
    recordedAt: NOW - 1_000_000,
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

/**
 * 安装成本管理三面板所需的全部 mock 后端。
 *
 * 依赖链：会话列表 → 会话详情/场景记忆 → 全局累计用量 → 全局预算护栏 →
 * 按会话聚合对比 → 会话级用量记录（供成本预测趋势）。
 */
function installCostManagementMocks(page: Page): void {
  // Provider config：chat 模式 + 视觉支持（不依赖媒体授权）。
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

  // 会话列表：返回既有会话。
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

  // 会话详情：返回历史消息。
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

  // 场景记忆：空（本次聚焦成本面板）。
  void page.route(`**/api/sessions/${SESSION.id}/scene-memory`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, entries: [] }),
    }),
  );

  // ① 全局预算护栏视图（预算配置 + 当月用量 + 使用率）。
  void page.route("**/api/sessions/usage/budget", (route) => {
    if (route.request().method() === "PUT") {
      // 保存预算：回显保存后的视图。
      const body = route.request().postDataJSON() ?? {};
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          budget: {
            monthlyBudgetUsd: body.monthlyBudgetUsd ?? 5,
            alertThresholdPct: body.alertThresholdPct ?? 80,
            updatedAt: NOW,
          },
          month: {
            monthKey: "2026-08",
            turnCount: 12,
            estimatedCostUsd: 3.4,
            inputTokens: 22000,
            outputTokens: 4000,
          },
          usedPct: body.monthlyBudgetUsd
            ? Math.round((3.4 / body.monthlyBudgetUsd) * 100)
            : 68,
        }),
      });
      return;
    }
    // GET：启用护栏，预算 5 USD，已用 3.4 USD（68% → 未达 80% 阈值）。
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        budget: {
          monthlyBudgetUsd: 5,
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
        usedPct: 68,
      }),
    });
  });

  // ③ 跨会话成本对比：按会话聚合（成本降序）。
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
            sessionId: "cost-session-2",
            title: "旧会话",
            providerMode: "realtime",
            turnCount: 5,
            inputTokens: 12000,
            outputTokens: 6000,
            estimatedCostUsd: 1.1,
            lastRecordedAt: NOW - 3600_000,
          },
        ],
      }),
    }),
  );

  // ② 会话级用量记录（当前会话，供成本预测趋势 + 会话级用量导出）。
  void page.route(`**/api/sessions/${SESSION.id}/usage`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        entries: USAGE_ENTRIES,
        totals: USAGE_TOTALS,
      }),
    }),
  );

  // 全局累计用量（跨会话汇总，供 GlobalUsagePanel）。
  void page.route("**/api/sessions/usage/totals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        totals: { ...USAGE_TOTALS, turnCount: 13 },
      }),
    }),
  );
}

/** 打开会话侧边栏抽屉并等待渲染完成。 */
async function openSidebar(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 会话列表加载完成 → 侧边栏抽屉按钮可用。
  const sessionsButton = page.getByRole("button", { name: "Sessions" });
  await expect(sessionsButton).toBeVisible({ timeout: 15_000 });

  await sessionsButton.click();
  await expect(
    page.getByRole("dialog", { name: /sidebar/i }),
  ).toBeVisible();
}

test("侧边栏渲染全局预算护栏 + 成本预测 + 跨会话对比三面板 @smoke", async ({
  page,
}) => {
  await installCostManagementMocks(page);
  await openSidebar(page);

  const drawer = page.getByRole("dialog", { name: /sidebar/i });

  // ① 全局预算护栏面板。
  const budgetPanel = drawer.getByLabel("Cross-session budget guardrail");
  await expect(budgetPanel).toBeVisible();
  await expect(budgetPanel.getByText("Monthly budget guardrail")).toBeVisible();
  // 已用金额 + 进度条。
  await expect(budgetPanel.locator('[role="progressbar"]')).toHaveCount(1);

  // ② 成本预测面板（≥3 条趋势 → 有效外推）。
  const forecastPanel = drawer.getByLabel("Cost trend forecast");
  await expect(forecastPanel).toBeVisible();
  await expect(forecastPanel.getByText("Cost forecast")).toBeVisible();
  // 当前/预测/增量三栏。
  await expect(forecastPanel.getByText("Current")).toBeVisible();
  await expect(forecastPanel.getByText("Projected")).toBeVisible();
  await expect(forecastPanel.getByText("Δ to date")).toBeVisible();

  // ③ 跨会话成本对比面板。
  const comparisonPanel = drawer.getByLabel("Cross-session cost comparison");
  await expect(comparisonPanel).toBeVisible();
  await expect(comparisonPanel.getByText("Cost by session")).toBeVisible();
  // 两个会话的标题都出现在对比区。
  await expect(comparisonPanel.getByText("演示会话")).toBeVisible();
  await expect(comparisonPanel.getByText("旧会话")).toBeVisible();
});

test("全局预算护栏：编辑预算并保存后刷新使用率 @smoke", async ({
  page,
}) => {
  // 侧边栏含多个成本面板，拉高视口确保「保存预算」按钮在折叠内可见。
  await page.setViewportSize({ width: 1280, height: 1200 });
  await installCostManagementMocks(page);
  await openSidebar(page);

  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  const budgetPanel = drawer.getByLabel("Cross-session budget guardrail");
  await expect(budgetPanel).toBeVisible();

  // 初始预算 5 USD，已用 3.4 USD → 68%。
  await expect(budgetPanel.getByText("68.0%")).toBeVisible();

  // 预算金额输入框与阈值输入框（aria-label）。
  const budgetInput = budgetPanel.getByLabel("Monthly budget (USD)");
  const thresholdInput = budgetPanel.getByLabel("Alert threshold (%)");
  await expect(budgetInput).toBeVisible();
  await expect(thresholdInput).toBeVisible();

  // 把预算改为 4 USD → 已用 3.4/4 = 85% → 触发 warn 告警（≥80% 阈值）。
  await budgetInput.fill("4");
  const saveButton = budgetPanel.getByRole("button", {
    name: "Save budget",
  });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click({ force: true });

  // 保存成功后使用率刷新为 85%。
  await expect(budgetPanel.getByText("85.0%")).toBeVisible();
});

test("跨会话成本对比面板展示按会话成本条形与汇总 @smoke", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await installCostManagementMocks(page);
  await openSidebar(page);

  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  const comparisonPanel = drawer.getByLabel("Cross-session cost comparison");
  await expect(comparisonPanel).toBeVisible();

  // 汇总：会话数 / 总成本 / 总轮次。
  await expect(comparisonPanel.getByText("Sessions")).toBeVisible();
  await expect(comparisonPanel.getByText("Total")).toBeVisible();
  await expect(comparisonPanel.getByText("Turns")).toBeVisible();

  // 每个会话的成本值与标题都展示在对比区。
  await expect(comparisonPanel.getByText("演示会话")).toBeVisible();
  await expect(comparisonPanel.getByText("旧会话")).toBeVisible();
  // 两个会话各自的估算成本（USD）。
  await expect(comparisonPanel.getByText("$2.20")).toBeVisible();
  await expect(comparisonPanel.getByText("$1.10")).toBeVisible();
});
