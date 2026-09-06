import { test, expect } from "@playwright/test";

/**
 * M5.1 E2E — 核心路径 2：Chat 模式文本对话（mock SSE 流式）。
 *
 * mock provider config 与 chat completion SSE，验证：
 *   - 文本输入 + 发送后，转写区出现用户消息
 *   - 流式增量被逐字渲染为助手回复
 */
test("Chat 模式文本对话（流式回复） @smoke", async ({ page }) => {
  // Mock provider config：chat 模式，支持视觉
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

  // Mock chat completion：返回流式 SSE 增量
  await page.route("**/api/chat/completion", (route) => {
    const sse =
      'data: {"success":true,"delta":"你好"}\n\n' +
      'data: {"success":true,"delta":"，我是"}\n\n' +
      'data: {"success":true,"delta":"视觉助手"}\n\n' +
      "data: [DONE]\n\n";
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "cache-control": "no-cache", connection: "keep-alive" },
      body: sse,
    });
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 找到文本输入框（aria-label 含 messageInput）
  const input = page.getByRole("textbox").first();
  await input.fill("看看画面里有什么？");

  // 提交表单（回车触发 onSubmit）
  await input.press("Enter");

  // 转写区应出现用户消息
  await expect(page.getByText("看看画面里有什么？").first()).toBeVisible({
    timeout: 15_000,
  });

  // 助手流式回复应逐字出现（合并后的完整文本）
  await expect(page.getByText("你好，我是视觉助手").first()).toBeVisible({
    timeout: 15_000,
  });
});
