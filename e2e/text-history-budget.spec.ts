import { test, expect, type Page } from "@playwright/test";

/**
 * E2E 补强 — 文本历史摘要 + 成本预算边界路径。
 *
 * 在既有成本面板交互（toggle / radio 选中态）基础上，补强两条**边界路径**：
 *   1. 文本历史摘要：开启开关但轮次不足时不注入 historyContext（边界），
 *      且开启后会话请求不崩溃、转写正常（行为边界）。
 *   2. 成本预算边界：逐一切换 brief / standard / detailed 三个预算档位，
 *      验证实际发出的 chat completion 请求载荷携带对应的 `responseBudget`
 *      （成本预算的上下边界都被真实请求链路覆盖）。
 *
 * 纯前端 + mock chat SSE，可在 headless 下稳定运行。
 */

async function mockChatConfig(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });

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
}

/** 捕获 chat completion 请求体并返回流式 SSE。 */
async function mockChatCompletion(
  page: Page,
  capturedBodies: Record<string, unknown>[],
): Promise<void> {
  await page.route("**/api/chat/completion", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    capturedBodies.push(body);
    const sse =
      'data: {"success":true,"delta":"好的"}\n\n' +
      'data: {"success":true,"delta":"，已收到"}\n\n' +
      "data: [DONE]\n\n";
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "cache-control": "no-cache", connection: "keep-alive" },
      body: sse,
    });
  });
}

async function sendTextTurn(
  page: Page,
  text: string,
): Promise<void> {
  const input = page.getByRole("textbox").first();
  await input.fill(text);
  await input.press("Enter");
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
}

test("开启文本历史摘要但轮次不足时不注入 historyContext（边界） @smoke", async ({
  page,
}) => {
  const captured: Record<string, unknown>[] = [];
  await mockChatConfig(page);
  await mockChatCompletion(page, captured);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 成本面板（Chat）出现文本历史摘要开关并开启。
  const historyLabel = page
    .locator("label")
    .filter({ hasText: /text-history|文本历史摘要/i })
    .first();
  await expect(historyLabel).toBeVisible({ timeout: 15_000 });
  await historyLabel.click();

  // 首轮轮次不足（< maxVerbatimTurns），即使开关开启也不应注入 historyContext。
  await sendTextTurn(page, "第一轮问题");

  await expect
    .poll(() => captured.length, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  const first = captured[0] as Record<string, unknown>;
  expect(first.message).toBe("第一轮问题");
  // 边界：轮次不足 → 不携带 historyContext
  expect(first.historyContext).toBeUndefined();

  // 行为边界：回复仍被流式渲染。
  await expect(page.getByText("好的，已收到").first()).toBeVisible({
    timeout: 15_000,
  });
});

test("成本预算边界：brief / standard / detailed 逐一反映到请求载荷 @smoke", async ({
  page,
}) => {
  const captured: Record<string, unknown>[] = [];
  await mockChatConfig(page);
  await mockChatCompletion(page, captured);
  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 默认 standard（RealtimeResponseBudget 默认值）。
  const standard = page.locator('input[name="response-budget"][value="standard"]');
  await expect(standard).toBeChecked({ timeout: 15_000 });

  // —— 边界下档：detailed ——
  await page.locator("label:has-text('Detailed')").click();
  await expect(
    page.locator('input[name="response-budget"][value="detailed"]'),
  ).toBeChecked();
  await sendTextTurn(page, "详细回答的问题");
  await expect.poll(() => captured.length).toBeGreaterThanOrEqual(1);
  expect(captured[0]?.responseBudget).toBe("detailed");

  // —— 边界上档：brief ——
  await page.locator("label:has-text('Brief')").click();
  await expect(
    page.locator('input[name="response-budget"][value="brief"]'),
  ).toBeChecked();
  await sendTextTurn(page, "简短回答的问题");
  await expect.poll(() => captured.length).toBeGreaterThanOrEqual(2);
  expect(captured[1]?.responseBudget).toBe("brief");

  // —— 回退中档：standard ——
  await page.locator("label:has-text('Standard')").click();
  await expect(standard).toBeChecked();
  await sendTextTurn(page, "标准回答的问题");
  await expect.poll(() => captured.length).toBeGreaterThanOrEqual(3);
  expect(captured[2]?.responseBudget).toBe("standard");
});
