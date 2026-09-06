import { test, expect, type Page } from "@playwright/test";

/**
 * E2E — 会话级消费预算守护（spending budget guard）。
 *
 * 用量面板提供「消费预算」设置入口：输入上限（USD）→ 设置 → 渲染进度条；
 * 达到/超过预算时出现告警；可清除预算。纯前端 + mock provider config，
 * 不依赖真实媒体/后端，可在 headless 下稳定运行。
 *
 * 覆盖路径：
 *   1. Chat 模式用量面板渲染预算入口（未设置时无进度条）；
 *   2. 设置预算 → 出现进度条与「已用/预算」文案；
 *   3. 清除预算 → 进度条消失。
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

test("Chat 模式用量面板渲染预算入口，未设置时无进度条 @smoke", async ({
  page,
}) => {
  await mockChatConfig(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // Chat 模式用量面板（aria-label = "Chat usage"）。
  const usagePanel = page.getByLabel("Chat usage");
  await expect(usagePanel).toBeVisible({ timeout: 15_000 });

  // 预算入口存在（"Spending budget"）。
  await expect(usagePanel.getByText("Spending budget")).toBeVisible();

  // 未设置预算 → 无进度条。
  await expect(usagePanel.locator('[role="progressbar"]')).toHaveCount(0);
});

test("设置预算后出现进度条，清除后消失 @smoke", async ({ page }) => {
  await mockChatConfig(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  const usagePanel = page.getByLabel("Chat usage");
  await expect(usagePanel).toBeVisible({ timeout: 15_000 });

  // 输入预算 5 → 点击 Set。
  const budgetInput = usagePanel.getByPlaceholder("Set budget (USD)");
  await expect(budgetInput).toBeVisible();
  await budgetInput.fill("5");
  await usagePanel.getByRole("button", { name: "Set" }).click();

  // 出现进度条 + 「已用/预算」文案。
  await expect(usagePanel.locator('[role="progressbar"]')).toHaveCount(1);
  await expect(usagePanel.getByText("No budget set")).toHaveCount(0);

  // 清除预算 → 进度条消失。
  await usagePanel.getByRole("button", { name: "Clear" }).click();
  await expect(usagePanel.locator('[role="progressbar"]')).toHaveCount(0);
  await expect(usagePanel.getByText("No budget set")).toBeVisible();
});
