import { test, expect, type Page } from "@playwright/test";

/**
 * M5 E2E 补强 — 视觉上下文面板统计区交互。
 *
 * 在 Chat 模式（mock provider config）下，验证「最近画面」面板的**统计区**结构
 * 与可见性联动：
 *   - 统计卡片（Sampled / Sent / Skipped / Pruned / Interval）随面板渲染
 *   - 安全提示条（Security）随面板渲染
 *   - 通过工具栏 "Recent frames" 按钮切换面板 → 统计区整体隐藏/恢复
 *
 * 纯前端 + mock API，无媒体依赖，headless 可稳定运行。
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

test("视觉上下文面板渲染统计卡片与安全提示条 @smoke", async ({ page }) => {
  await mockChatConfig(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 面板（aria-label = Visual context）默认可见。
  const panel = page.locator('[aria-label="Visual context"]');
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // 统计卡片标签齐全：Sampled / Sent / Skipped / Pruned / Interval。
  for (const label of ["Sampled", "Sent", "Skipped", "Pruned", "Interval"]) {
    await expect(panel.getByText(label).first()).toBeVisible();
  }

  // 默认无媒体帧：四个计数卡片应显示 0。
  const sampled = panel.locator("dd").filter({ hasText: /^0$/ });
  await expect(sampled).toHaveCount(4);

  // 安全提示条（data-security-strip）渲染。
  await expect(panel.locator("[data-security-strip]")).toBeVisible();
});

test("切换工具栏按钮联动统计区整体隐藏与恢复 @smoke", async ({ page }) => {
  await mockChatConfig(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  const toggleButton = page
    .getByRole("button", { name: "Recent frames" })
    .first();
  await expect(toggleButton).toBeVisible({ timeout: 15_000 });

  const panel = page.locator('[aria-label="Visual context"]');
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // 隐藏：统计卡片与安全提示条随之不可见。
  await toggleButton.click();
  await expect(toggleButton).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden({ timeout: 15_000 });
  await expect(panel.locator("[data-security-strip]")).toBeHidden();

  // 恢复：统计卡片与安全提示条重新可见。
  await toggleButton.click();
  await expect(toggleButton).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText("Sampled").first()).toBeVisible();
  await expect(panel.locator("[data-security-strip]")).toBeVisible();
});
