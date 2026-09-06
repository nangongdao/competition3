import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * M9 / 无障碍专项 — 自动可访问性审计（axe-core）。
 *
 * 对工作台主页面与关键交互态运行 axe 扫描，断言无严重可访问性问题。
 * 覆盖（对应 2026-08-20 a11y 专项修复）：
 *   - 成本面板标题颜色对比度（panel-heading 曾浅色文字落在浅色浮层上，对比度 1.09）
 *   - 转写列表语义（ol 直接子元素曾含 div、li 无 ul/ol 父级）
 *   - 成本面板可滚动 dl 的键盘可达性（scrollable-region-focusable）
 *
 * 纯前端 + mock API，headless 可稳定运行。
 */

async function mockChatConfig(page: Page): Promise<void> {
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
}

test("工作台主页面无严重 a11y 违规 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 等主要面板（成本面板）渲染完成。
  await expect(page.getByLabel("Cost & Mode")).toBeVisible({ timeout: 15_000 });

  const results = await new AxeBuilder({ page }).analyze();
  // 仅断言严重/关键问题；中等/轻微作为提示不阻断。
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  expect(
    serious.map((v) => `${v.id}: ${v.help}`),
    `存在严重 a11y 违规：\n${JSON.stringify(serious, null, 2)}`,
  ).toEqual([]);
});

test("打开会话侧边栏抽屉后仍无严重 a11y 违规 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  // 会话列表（空）→ 触发会话加载完成，使侧边栏渲染完成。
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
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByRole("dialog", { name: /sidebar/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  expect(
    serious.map((v) => `${v.id}: ${v.help}`),
    `侧边栏打开后存在严重 a11y 违规：\n${JSON.stringify(serious, null, 2)}`,
  ).toEqual([]);
});

test("成本驾驶舱面板无严重 a11y 违规 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  // 会话列表（空）→ 触发会话加载完成，进而拉取预算/对比。
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
  // 提供成本驾驶舱数据（预算 + 按会话聚合）。
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
        usedPct: 73.3,
      }),
    }),
  );
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
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  await page.getByRole("button", { name: "Sessions" }).click();
  const cockpit = page.getByLabel("Global Cost Cockpit");
  await expect(cockpit).toBeVisible({ timeout: 15_000 });

  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  expect(
    serious.map((v) => `${v.id}: ${v.help}`),
    `成本驾驶舱存在严重 a11y 违规：\n${JSON.stringify(serious, null, 2)}`,
  ).toEqual([]);
});

test("浅色主题下无颜色对比度违规（WCAG AA）@smoke", async ({ page }) => {
  await mockChatConfig(page);
  // 浅色主题的小字号说明/占位符/次级文字 token 曾对比度不足
  // （soft-fg-muted ≈2.68:1、soft-fg ≈4.65:1），已提亮修复。
  // 此处切到浅色主题后对工作台全页跑 axe 颜色对比度专项断言。
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);
  await expect(page.getByLabel("Cost & Mode")).toBeVisible({
    timeout: 15_000,
  });

  // 切换浅色主题。
  const themeGroup = page.getByRole("group", { name: /theme/i });
  await themeGroup.getByRole("button", { name: /light/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  // 仅针对颜色对比度规则断言：浅色主题应无 color-contrast 严重违规。
  const results = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  expect(
    serious.map((v) => `${v.id}: ${v.help}`),
    `浅色主题存在颜色对比度违规：\n${JSON.stringify(serious, null, 2)}`,
  ).toEqual([]);
});
