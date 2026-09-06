import { test, expect } from "@playwright/test";

/**
 * M5.1 E2E — 视觉上下文面板交互（"最近画面" 面板可见性切换）。
 *
 * Chat 模式下通过工具栏 "Recent frames" 按钮切换视觉上下文面板的可见性，
 * 验证：
 *   - 面板默认可见（工具栏按钮 aria-expanded=true）
 *   - 点击后面板隐藏（HTML hidden 属性），按钮 aria-expanded=false
 *   - 再次点击后面板恢复可见
 *
 * 纯前端交互，无媒体依赖，headless 可稳定运行。
 */

async function mockChatConfig(page: import("@playwright/test").Page): Promise<void> {
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

test("切换视觉上下文面板可见性 @smoke", async ({ page }) => {
  await mockChatConfig(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 工具栏 "Recent frames" 按钮（面板可见性开关）。
  const toggleButton = page
    .getByRole("button", { name: "Recent frames" })
    .first();
  await expect(toggleButton).toBeVisible({ timeout: 15_000 });
  // 默认可见：按钮 aria-expanded=true。
  await expect(toggleButton).toHaveAttribute("aria-expanded", "true");

  // 视觉上下文面板（aria-label 为 Visual context）默认可见。
  const panel = page.locator('[aria-label="Visual context"]');
  await expect(panel).toBeVisible({ timeout: 15_000 });

  // 点击按钮 → 面板隐藏。
  await toggleButton.click();
  await expect(toggleButton).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden({ timeout: 15_000 });

  // 再次点击 → 面板恢复可见。
  await toggleButton.click();
  await expect(toggleButton).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible({ timeout: 15_000 });
});
