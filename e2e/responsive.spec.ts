import { test, expect } from "@playwright/test";

/**
 * M2.3 E2E 补强 —— 响应式无溢出。
 *
 * 在 375px（移动端）与 1024px（平板）两种视口下验证：
 *   - 页面无水平方向滚动溢出（`scrollWidth <= clientWidth`）
 *   - 核心工作台仍可挂载并展示
 *
 * 通过内联 JS 测量文档与工作台宽度，避免依赖具体 CSS 断点实现。
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

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page): Promise<void> {
  // 等布局稳定后再测量（含懒加载 / 恢复 effect）。
  await page.waitForTimeout(300);

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const hasOverflow = doc.scrollWidth > doc.clientWidth;
    return {
      hasOverflow,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });

  expect(
    overflow.hasOverflow,
    `期望无水平溢出（scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}）`,
  ).toBe(false);
}

test("375px 移动端视口无水平溢出 @smoke", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  installChatConfigMock(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);
  await expect(
    page.locator("text=/Waiting for visual input/i").first(),
  ).toBeVisible({ timeout: 15_000 });

  await expectNoHorizontalOverflow(page);
});

test("1024px 平板视口无水平溢出 @smoke", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  installChatConfigMock(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);
  await expect(
    page.locator("text=/Waiting for visual input/i").first(),
  ).toBeVisible({ timeout: 15_000 });

  await expectNoHorizontalOverflow(page);
});
