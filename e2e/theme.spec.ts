import { test, expect } from "@playwright/test";

/**
 * M5 E2E 补强 — 暗色模式三态切换与偏好持久化。
 *
 * 覆盖 M2.2 暗色模式的关键用户路径：
 *   - 切换到「深色」时 <html data-theme="dark"> 生效
 *   - 偏好写入 localStorage（assistant-theme-preference-v1）
 *   - 刷新后偏好被恢复，主题保持深色
 *   - 切回「浅色」时 data-theme 变回 light
 *
 * 纯前端交互，无需 mock 媒体 / 后端，可在 headless 下稳定运行。
 */
test("暗色模式切换并持久化到 localStorage @smoke", async ({ page }) => {
  // 以英文界面运行，便于稳定断言
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 主题切换组存在（aria-label = Theme）
  const themeGroup = page.getByRole("group", { name: "Theme" });
  await expect(themeGroup).toBeVisible({ timeout: 15_000 });

  // 点击「深色」
  await themeGroup.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // 偏好已写入 localStorage
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("assistant-theme-preference-v1"),
  );
  expect(stored).toBe('"dark"');

  // 刷新后主题保持深色（偏好恢复）
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark", {
    timeout: 15_000,
  });

  // 切回「浅色」
  const themeGroupAfter = page.getByRole("group", { name: "Theme" });
  await themeGroupAfter.getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("跟随系统主题（system 模式）默认生效 @smoke", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
    // 系统偏好为深色
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: query.includes("prefers-color-scheme: dark"),
        media: query,
        addEventListener: () => {
          /* no-op */
        },
        removeEventListener: () => {
          /* no-op */
        },
        addListener: () => {
          /* no-op */
        },
        removeListener: () => {
          /* no-op */
        },
        dispatchEvent: () => false,
        onchange: null,
      }) as unknown as MediaQueryList;
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 默认偏好为 system，跟随系统深色
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark", {
    timeout: 15_000,
  });
});
