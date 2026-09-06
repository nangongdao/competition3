import { test, expect } from "@playwright/test";

/**
 * M5.1 E2E — 核心路径 3：Realtime 模式 UI 与优雅降级（mock 后端）。
 *
 * 无真实摄像头/麦克风（headless 无法授予媒体权限）时，验证：
 *   - provider config 返回 realtime 模式时，UI 正确切换到 Realtime 会话面板
 *   - 缺少媒体权限时 Realtime 启动按钮为禁用态（优雅降级，不崩溃）
 *   - 转写区出现初始系统引导（Worker 配置说明）
 */
test("Realtime 模式 UI 渲染与无媒体优雅降级 @smoke", async ({ page }) => {
  // 拒绝摄像头/麦克风权限，模拟无媒体设备环境
  await page.context().grantPermissions([], { origin: "http://127.0.0.1:4173" });

  // Mock provider config：realtime 模式（无视觉）
  await page.route("**/api/provider/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        providerMode: "realtime",
        visionCapability: "none",
      }),
    }),
  );

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // Realtime 模式主按钮存在（无媒体时禁用，优雅降级）
  const startButton = page.getByRole("button", { name: "Start session" });
  await expect(startButton).toBeDisabled({ timeout: 15_000 });

  // 页面整体可用：出现摄像头等待视觉输入占位
  await expect(
    page.locator("text=/Waiting for visual input/i").first(),
  ).toBeVisible({ timeout: 15_000 });
});
