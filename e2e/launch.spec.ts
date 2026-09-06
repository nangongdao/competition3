import { test, expect } from "@playwright/test";

/**
 * M5.1 E2E — 核心路径 1：无凭证启动 → 配置/错误提示。
 *
 * 在无后端 / 凭证的情况下启动应用，验证：
 *   - 页面能挂载（root 渲染）
 *   - provider config 获取失败时展示错误提示（role=alert）
 *   - 用户可看到需要配置的提示
 */
test("无凭证启动时展示配置错误提示 @smoke", async ({ page }) => {
  // Mock provider config 返回 503（模拟后端未配置 OPENAI_API_KEY）
  await page.route("**/api/provider/config", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: {
          code: "missing_openai_api_key",
          message: "OPENAI_API_KEY is not configured",
        },
      }),
    }),
  );

  await page.goto("/");

  // 页面挂载：出现摄像头预览占位（等待视觉输入）
  await expect(
    page.locator("text=/Waiting for visual input/i").first(),
  ).toBeVisible({ timeout: 15_000 });

  // 出现配置错误提示（role=alert）
  const alert = page.locator('[role="alert"]').first();
  await expect(alert).toBeVisible();
});
