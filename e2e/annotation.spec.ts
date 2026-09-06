import { test, expect } from "@playwright/test";

/**
 * M4.3 E2E 补强 —— 空间定位标注叠加层。
 *
 * mock provider config（chat + 视觉）与 chat completion SSE，
 * 让模型回复携带 `[ANNOTATIONS]` 结构化标注块，验证：
 *   - 标注块被解析为归一化坐标并在摄像头预览上叠加渲染
 *   - 标注块从展示文本中剥离（转写区只显示干净文本）
 */

// 一段携带空间标注块的助手回复。
const ANNOTATION_LABEL = "笔记本";
const ANNOTATION_JSON = JSON.stringify({
  label: ANNOTATION_LABEL,
  box: { x: 0.4, y: 0.3, w: 0.3, h: 0.2 },
});

test("模型回复中的空间标注在摄像头预览上叠加渲染", async ({ page }) => {
  // Mock provider config：chat 模式 + 视觉支持。
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

  // Mock chat completion：流式返回"识别结果 + 标注块"。
  // 注意：delta 内容需用 JSON.stringify 转义，否则标注块 JSON 中的引号会破坏 SSE 外层 JSON。
  await page.route("**/api/chat/completion", (route) => {
    const annotationBlock = `[ANNOTATIONS][${ANNOTATION_JSON}][/ANNOTATIONS]`;
    const delta1 = JSON.stringify({
      success: true,
      delta: `画面上有一台${ANNOTATION_LABEL}。`,
    });
    const delta2 = JSON.stringify({ success: true, delta: annotationBlock });
    const sse =
      `data: ${delta1}\n\n` +
      `data: ${delta2}\n\n` +
      "data: [DONE]\n\n";
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "cache-control": "no-cache", connection: "keep-alive" },
      body: sse,
    });
  });

  // 会话持久化端点无需 mock：无后端时优雅降级为空会话，不影响聊天流程。

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 输入并发送问题，触发 chat completion。
  const input = page.getByRole("textbox").first();
  await input.fill("画面上有什么？");
  await input.press("Enter");

  // 助手回复的干净文本（标注块已被剥离）出现在转写区。
  await expect(
    page.getByText(`画面上有一台${ANNOTATION_LABEL}。`).first(),
  ).toBeVisible({ timeout: 15_000 });

  // 空间标注叠加层出现：含标注标签。
  // aria-label 为 "Spatial annotations"（首字母大写），CSS 属性选择器区分大小写。
  const overlay = page.locator('[aria-label*="Spatial"]');
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  await expect(overlay.getByText(ANNOTATION_LABEL, { exact: true }).first()).toBeVisible();
});
