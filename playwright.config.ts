import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 配置（M5.1）。
 *
 * 覆盖三条核心用户路径：
 *   1. 无凭证启动 → 配置/错误提示（provider config 获取失败时的降级）
 *   2. Chat 模式文本对话（mock /api/chat/completion SSE）
 *   3. Realtime 模式启停（mock provider config + WebRTC 启停按钮）
 *
 * CI 中运行 smoke 子集（--grep @smoke），本地可全量跑。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // 先用已构建的 dist 起 preview 服务，避免 dev 服务器占用
  webServer: {
    command: "pnpm preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
