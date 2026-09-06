import { test, expect } from "@playwright/test";

/**
 * M2.2/M3.4 E2E 补强 —— 暗色模式三态 + 语言切换。
 *
 * mock provider config（聊天模式即可），验证：
 *   - 点击"Dark"主题按钮 → `<html data-theme="dark">`
 *   - 点击"Light"主题按钮 → `<html data-theme="light">`
 *   - 点击"中文"语言按钮 → 界面文案即时切换为中文
 *
 * 默认浏览器语言为英文（Playwright chromium desktop），故初始 UI 为英文。
 */

function installChatConfigMock(page: import("@playwright/test").Page): void {
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
}

test("三态主题切换驱动 html data-theme @smoke", async ({ page }) => {
  installChatConfigMock(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 主题切换控件（toolbar.themeMode = Theme）。
  const themeGroup = page.getByRole("group", { name: /theme/i });
  await expect(themeGroup).toBeVisible();

  // 默认跟随系统（headless chromium 通常为浅色）。
  // 点击 Dark 强制深色。
  await themeGroup.getByRole("button", { name: /dark/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // 点击 Light 切回浅色。
  await themeGroup.getByRole("button", { name: /light/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("语言切换即时生效为中文 @smoke", async ({ page }) => {
  installChatConfigMock(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 初始为英文：摄像头等待输入文案为英文。
  await expect(
    page.locator("text=/Waiting for visual input/i").first(),
  ).toBeVisible({ timeout: 15_000 });

  // 语言切换控件（toolbar.themeMode 旁边）。
  const languageGroup = page.getByRole("group", { name: /language/i });
  await expect(languageGroup).toBeVisible();

  // 点击"中文"。
  await languageGroup.getByRole("button", { name: "中文" }).click();

  // 界面文案即时切换为中文。
  await expect(
    page.locator("text=等待视觉输入").first(),
  ).toBeVisible({ timeout: 15_000 });
});
