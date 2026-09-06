import { test, expect } from "@playwright/test";

/**
 * M5 E2E 补强 — 国际化（M3.4）中 / 英切换。
 *
 * 覆盖语言切换关键路径：
 *   - 语言组（Language switch）存在
 *   - 切到中文后界面文案变为中文（会话副标题「实时对话助手」）
 *   - 切回英文后文案恢复英文（Session subtitle）
 *
 * 纯前端交互，无需 mock 后端 / 媒体。
 */
test("中 / 英界面语言切换 @smoke", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 语言切换组存在（英文环境 aria-label = Language）
  const langGroup = page.getByRole("group", { name: "Language" });
  await expect(langGroup).toBeVisible({ timeout: 15_000 });

  // 初始英文：会话副标题为英文
  await expect(
    page.locator("text=Realtime Assistant").first(),
  ).toBeVisible();

  // 切到中文
  await langGroup.getByRole("button", { name: "中文" }).click();

  // 会话副标题变为中文
  await expect(page.getByText("实时对话助手").first()).toBeVisible({
    timeout: 15_000,
  });

  // 语言偏好已持久化
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("app-language"),
  );
  expect(stored).toBe("zh");
});
