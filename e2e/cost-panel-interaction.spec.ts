import { test, expect, type Page } from "@playwright/test";

/**
 * M5.1 E2E — 成本面板用户交互路径。
 *
 * mock provider config 为 Chat 模式，验证用户在成本面板操作设置控件时
 * 前端状态正确反映（纯前端交互，不依赖真实媒体/外部环境）：
 *   - Chat 模式渲染成本面板（"Cost & Mode"）与响应预算单选组
 *   - 切换「文本历史摘要」开关 → checked 状态变化
 *   - 切换「响应长度」radio → 选中状态变化
 */

async function mockChatConfig(page: Page) {
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

test("Chat 模式成本面板渲染响应预算与文本历史摘要开关 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 成本面板可见（aria-label 为本地化文案 "Cost & Mode"）
  await expect(page.getByLabel("Cost & Mode")).toBeVisible({ timeout: 15_000 });

  // Chat 模式出现响应预算单选组（name=response-budget）
  await expect(
    page.locator('fieldset:has(input[name="response-budget"])'),
  ).toBeVisible();

  // Chat 模式出现文本历史摘要开关
  const historyLabel = page
    .locator("label")
    .filter({ hasText: /text-history|文本历史摘要/i })
    .first();
  await expect(historyLabel).toBeVisible();
});

test("切换文本历史摘要开关联动 checked 状态 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 定位「文本历史摘要」开关（label 内文本含 key 的中/英文案）
  const historyLabel = page
    .locator("label")
    .filter({ hasText: /text-history|文本历史摘要/i })
    .first();
  await expect(historyLabel).toBeVisible({ timeout: 15_000 });

  const checkbox = historyLabel.locator('input[type="checkbox"]');
  await expect(checkbox).not.toBeChecked();

  await historyLabel.click();
  await expect(checkbox).toBeChecked();

  // 再点一次取消
  await historyLabel.click();
  await expect(checkbox).not.toBeChecked();
});

test("切换响应预算 radio 联动选中状态 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 响应预算单选组
  const budgetOptions = page.locator('input[name="response-budget"]');
  await expect(budgetOptions.first()).toBeVisible({ timeout: 15_000 });
  const count = await budgetOptions.count();
  expect(count).toBeGreaterThanOrEqual(2);

  // 默认选中 standard（RealtimeResponseBudget 默认值）
  const standard = page.locator('input[name="response-budget"][value="standard"]');
  await expect(standard).toBeChecked();

  // radio 视觉隐藏，通过 label 文本点击切换
  await page.locator("label:has-text('Detailed')").click();
  const detailed = page.locator('input[name="response-budget"][value="detailed"]');
  await expect(detailed).toBeChecked();
  await expect(standard).not.toBeChecked();

  // 切回 brief
  await page.locator("label:has-text('Brief')").click();
  const brief = page.locator('input[name="response-budget"][value="brief"]');
  await expect(brief).toBeChecked();
  await expect(detailed).not.toBeChecked();
});
