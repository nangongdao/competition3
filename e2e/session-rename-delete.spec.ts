import { test, expect, type Page } from "@playwright/test";

/**
 * M5 E2E 补强 — 会话重命名 + 删除（M3.3 多会话管理用户路径）。
 *
 * 通过 mock `/api/sessions*` 后端提供既有会话，验证侧边栏行内操作：
 *   - 悬停会话行 → 重命名按钮 → 行内编辑 → 保存（PATCH）→ 标题更新
 *   - 悬停会话行 → 删除按钮 → 二次确认 → 删除（DELETE）→ 会话消失
 *
 * 纯前端 + mock API，无需真实 D1，可在 headless 下稳定运行。
 */

const SESSION_A = {
  id: "sess-a",
  title: "会话甲",
  providerMode: "chat",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_500,
  messageCount: 2,
};

async function mockSessionBackend(page: Page): Promise<void> {
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

  // 会话列表：一条既有会话。
  await page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION_A],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }),
  );
  await page.route("**/api/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION_A],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }),
  );

  // 会话详情（历史消息）。
  await page.route("**/api/sessions/sess-a", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION_A, messages: [] },
      }),
    }),
  );
}

async function openDrawer(page: Page) {
  await page.getByRole("button", { name: "Sessions" }).click();
  const drawer = page.getByRole("dialog", { name: /sidebar/i });
  await expect(drawer).toBeVisible();
  return drawer;
}

test("会话重命名：行内编辑保存后标题更新 @smoke", async ({ page }) => {
  await mockSessionBackend(page);

  // 记录 PATCH 是否命中。
  let patchedTitle = "";
  await page.route("**/api/sessions/sess-a", (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      patchedTitle = body?.title ?? "";
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, session: { ...SESSION_A, title: patchedTitle } }),
      });
      return;
    }
    route.continue();
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  const drawer = await openDrawer(page);
  await expect(drawer.getByText("会话甲").first()).toBeVisible();

  // 悬停会话行 → 显示重命名按钮 → 点击进入行内编辑。
  const row = drawer.getByText("会话甲").first();
  await row.hover();
  await drawer.getByLabel("Rename 会话甲").click();

  // 行内输入框出现（aria-label = Session name）。
  const nameInput = drawer.getByLabel("Session name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("新名字甲");

  // 点击 Save 提交（PATCH）。
  // 注意：侧边栏同时含预算面板的「Save budget」按钮，必须精确匹配重命名的
  // 「Save」按钮（exact）以避免 strict mode 冲突。
  await drawer.getByRole("button", { name: "Save", exact: true }).click();

  // 断言 PATCH 已发出且标题更新。
  await expect.poll(() => patchedTitle).toBe("新名字甲");
  await expect(drawer.getByText("新名字甲").first()).toBeVisible({
    timeout: 15_000,
  });
});

test("会话删除：二次确认后从列表移除 @smoke", async ({ page }) => {
  await mockSessionBackend(page);

  // 记录 DELETE 是否命中。
  let deleted = false;
  await page.route("**/api/sessions/sess-a", (route) => {
    if (route.request().method() === "DELETE") {
      deleted = true;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
      return;
    }
    route.continue();
  });

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  const drawer = await openDrawer(page);
  await expect(drawer.getByText("会话甲").first()).toBeVisible();

  // 悬停会话行 → 点击删除按钮。
  const row = drawer.getByText("会话甲").first();
  await row.hover();
  await drawer.getByLabel("Delete 会话甲").click();

  // 出现二次确认文案 + Delete 确认按钮。
  await expect(drawer.getByText("Delete this session?")).toBeVisible();
  await drawer.getByRole("button", { name: "Delete", exact: true }).click();

  // 断言 DELETE 已发出且会话从列表移除（出现空态）。
  await expect.poll(() => deleted).toBe(true);
  await expect(drawer.getByText("No sessions yet").first()).toBeVisible({
    timeout: 15_000,
  });
});
