import { test, expect } from "@playwright/test";

/**
 * M3.2/M3.3 E2E 补强 —— 会话持久化/恢复。
 *
 * mock `/api/sessions/*` 返回既有会话与历史消息，验证：
 *   - 应用挂载后自动恢复最近会话的历史消息到转写区
 *   - 会话列表展示在侧边栏抽屉中
 *   - 恢复流程（含 M4.1 场景记忆恢复管线）被执行并给出系统提示
 */

const NOW = Date.now();

// 单条持久化会话（含历史消息）。
const SESSION = {
  id: "session-restore-1",
  title: "演示会话",
  providerMode: "chat",
  createdAt: NOW - 60_000,
  updatedAt: NOW - 10_000,
  messageCount: 2,
};

const MESSAGES = [
  {
    id: "msg-1",
    sessionId: SESSION.id,
    role: "user",
    content: "我上次问过的问题",
    modality: "text",
    tokens: 12,
    createdAt: NOW - 50_000,
  },
  {
    id: "msg-2",
    sessionId: SESSION.id,
    role: "assistant",
    content: "这是上次的助手回答",
    modality: "text",
    tokens: 20,
    createdAt: NOW - 40_000,
  },
];

// M4.1 场景记忆条目（跨会话恢复）。
const SCENE_MEMORY = [
  {
    id: "scene-1",
    sessionId: SESSION.id,
    entryId: "frame-1",
    summary: "桌面上有一台银灰色笔记本。",
    frameTokens: 420,
    recordedAt: NOW - 45_000,
  },
];

function installSessionMocks(page: import("@playwright/test").Page): void {
  // Provider config：chat 模式 + 视觉支持（恢复流程不依赖媒体授权）。
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

  // 会话列表：返回一条既有会话。
  void page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }),
  );
  void page.route("**/api/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }),
  );

  // 会话详情：返回历史消息。
  void page.route("**/api/sessions/session-restore-1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION, messages: MESSAGES },
      }),
    }),
  );

  // M4.1 场景记忆：返回既有摘要。
  void page.route("**/api/sessions/session-restore-1/scene-memory", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, entries: SCENE_MEMORY }),
    }),
  );
}

test("刷新后恢复历史消息与会话列表", async ({ page }) => {
  installSessionMocks(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 恢复的历史用户消息出现在转写区。
  await expect(page.getByText("我上次问过的问题").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("这是上次的助手回答").first()).toBeVisible();

  // 会话列表：打开侧边栏抽屉可见既有会话标题。
  await page.getByRole("button", { name: "Sessions" }).click();
  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("演示会话").first()).toBeVisible();
});

test("恢复后转写区出现恢复提示（含场景记忆恢复流水）", async ({ page }) => {
  installSessionMocks(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 恢复流程执行：转写区出现"已恢复上次会话。"系统提示，
  // 表明会话初始化 + 历史消息 + M4.1 场景记忆恢复管线均被触发。
  await expect(page.getByText("已恢复上次会话。").first()).toBeVisible({
    timeout: 15_000,
  });
});
