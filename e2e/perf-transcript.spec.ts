import { test, expect, type Page } from "@playwright/test";

/**
 * 性能度量基线 — 转写 1000 条渲染帧率（PERFORMANCE_UPGRADE §7）。
 *
 * 通过 mock 会话持久化接口注入 1000 条历史消息，验证会话恢复后：
 *   - 转写列表（M2.4 虚拟化渲染）在滚动 / 持续重渲染时保持流畅
 *   - 渲染帧率达到性能预算目标（≥ 55 FPS），作为回归防线
 *
 * 标签 `@perf`：不纳入 `@smoke` 主流程，避免 CI 负载抖动导致偶发失败；
 * 本地 / CI 可按需 `--grep "@perf"` 单独运行。
 */

const PROVIDER_CONFIG = {
  success: true,
  providerMode: "chat",
  visionCapability: "multi-image",
};

/** 构造一个含 messageCount 条消息的会话详情 mock。 */
function buildSessionDetail(messageCount: number) {
  const messages = Array.from({ length: messageCount }, (_, index) => ({
    id: `msg-${index}`,
    sessionId: "perf-session",
    role: index % 2 === 0 ? "user" : "assistant",
    content: `性能基线转写消息 ${index} — 用于度量虚拟列表渲染帧率。`,
    modality: "text",
    tokens: 12,
    createdAt: 1_700_000_000_000 + index,
  }));

  return {
    success: true,
    session: {
      id: "perf-session",
      title: "性能基线会话",
      providerMode: "chat",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000 + messageCount,
      messageCount,
      messages,
    },
  };
}

/** 度量一段窗口内的平均渲染帧率（FPS）。 */
async function measureAverageFps(page: Page, durationMs: number): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const startedAt = performance.now();

        const tick = () => {
          frames += 1;
          if (performance.now() - startedAt >= duration) {
            resolve(frames / (duration / 1000));
            return;
          }
          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
    durationMs,
  );
}

/**
 * 在持续滚动转写列表的同时度量平均渲染帧率（FPS）。
 *
 * 对 M2.4 虚拟化列表，滚动是最真实的压力场景：每次 scroll 触发虚拟窗口
 * 重排 + 新行挂载/卸载。此基线验证滚动过程中保持流畅（不掉帧）。
 */
async function measureScrollFps(page: Page, durationMs: number): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        const list = document.querySelector('ol[aria-live="polite"]') as
          | HTMLElement
          | null;
        if (list === null) {
          resolve(0);
          return;
        }

        let frames = 0;
        const startedAt = performance.now();
        const step = () => {
          // 来回滚动，模拟用户浏览长会话
          list.scrollTop =
            (list.scrollTop + 24) % Math.max(list.scrollHeight - list.clientHeight, 1);
          frames += 1;
          if (performance.now() - startedAt >= duration) {
            resolve(frames / (duration / 1000));
            return;
          }
          requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      }),
    durationMs,
  );
}

test("转写 1000 条渲染帧率达到性能预算 @perf", async ({ page }) => {
  // Mock provider config：chat 模式
  await page.route("**/api/provider/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PROVIDER_CONFIG),
    }),
  );

  // Mock 会话列表：返回一个会话
  await page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [
          {
            id: "perf-session",
            title: "性能基线会话",
            providerMode: "chat",
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000 + 1000,
            messageCount: 1000,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }),
  );

  // Mock 会话详情：注入 1000 条历史消息
  await page.route("**/api/sessions/perf-session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSessionDetail(1000)),
    }),
  );

  // Mock 场景记忆：空
  await page.route("**/api/sessions/perf-session/scene-memory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, entries: [] }),
    }),
  );

  await page.goto("/");

  // 等待会话恢复完成：出现"已恢复上次会话"系统提示
  await expect(page.getByText("已恢复上次会话").first()).toBeVisible({
    timeout: 20_000,
  });

  // 度量一帧窗口内的渲染帧率（含持续动画 / 滚动准备）
  const fps = await measureAverageFps(page, 1_000);

  // 性能预算：转写渲染帧率 ≥ 55 FPS（PERFORMANCE_UPGRADE §7）
  expect(fps).toBeGreaterThanOrEqual(55);

  // 滚动压力基线：持续滚动 1000 条虚拟列表时帧率仍 ≥ 55 FPS
  const scrollFps = await measureScrollFps(page, 1_000);
  expect(scrollFps).toBeGreaterThanOrEqual(55);
});
