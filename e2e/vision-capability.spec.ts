import { test, expect } from "@playwright/test";

/**
 * M5 E2E 补强 — 视觉能力分级徽章（M3.5 深化 / M9.3）。
 *
 * 覆盖「模型视觉能力分级」在会话面板的可见性：
 *   - 多模态模型（multi-image）→ 徽章 data-vision-capability="multi-image"
 *   - 无视觉模型（none）→ data-vision-capability="none"，并展示「不支持视觉」提示
 *   - Chat 模式 + none 时出现推荐切换模型的 note
 *
 * 通过 mock /api/provider/config 的 visionCapability 字段驱动，无需真实媒体。
 */
async function seedLanguage(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });
}

test("多模态模型展示 multi-image 视觉能力徽章 @smoke", async ({ page }) => {
  await seedLanguage(page);

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

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 视觉能力徽章存在，且数据标记为 multi-image
  const badge = page.locator('[data-vision-capability="multi-image"]');
  await expect(badge).toBeVisible({ timeout: 15_000 });

  // 多模态模型不展示「不支持视觉」提示
  const note = page.getByRole("note");
  await expect(note).toHaveCount(0);
});

test("无视觉模型展示 none 徽章 + 推荐切换提示 @smoke", async ({ page }) => {
  await seedLanguage(page);

  await page.route("**/api/provider/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        providerMode: "chat",
        visionCapability: "none",
      }),
    }),
  );

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 徽章标记为 none
  const badge = page.locator('[data-vision-capability="none"]');
  await expect(badge).toBeVisible({ timeout: 15_000 });

  // Chat 模式 + none 时展示「不支持视觉 + 推荐切换」note
  const note = page.getByRole("note").first();
  await expect(note).toBeVisible();
  await expect(note).toContainText(/does not support visual/i);
});
