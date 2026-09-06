import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { SessionSidebarDrawer } from "./session-sidebar-drawer";
import type { SessionSummary } from "@/modules/assistant/lib/session-client";

const baseProps = {
  open: true,
  sessions: [] as SessionSummary[],
  activeSessionId: null,
  onNew: vi.fn(),
  onSwitch: vi.fn(),
  onRename: vi.fn(),
  onRemove: vi.fn(),
  onExport: vi.fn(),
  onPrune: vi.fn(),
  onClose: vi.fn(),
  isPruning: false,
};

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "sess-1",
    title: "会话一",
    providerMode: "chat",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_500,
    messageCount: 3,
    ...overrides,
  };
}

describe("SessionSidebarDrawer", () => {
  it("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer {...baseProps} open={false} />
</MemoryRouter>
    );
    expect(html).toBe("");
  });

  it("renders the overlay dialog and close button when open", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer {...baseProps} />
</MemoryRouter>
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="toolbar.sidebarOverlay"');
    expect(html).toContain('aria-label="sidebar.closeSidebar"');
  });

  it("closes the drawer via the overlay button", () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer {...baseProps} onClose={onClose} />
</MemoryRouter>
    );
    expect(html).toContain("h-full flex-1");
  });

  it("renders empty state when no sessions are present", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer {...baseProps} sessions={[]} />
</MemoryRouter>
    );
    expect(html).toContain("sidebar.emptyTitle");
    expect(html).toContain("sidebar.emptyHint");
    expect(html).toContain("0</span>"); // 会话计数徽标
  });

  it("renders session rows with count badge and active highlight", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer
        {...baseProps}
        sessions={[makeSession({ id: "sess-a" }), makeSession({ id: "sess-b", title: "会话乙" })]}
        activeSessionId="sess-b"
      />
</MemoryRouter>
    );
    expect(html).toContain("会话一");
    expect(html).toContain("会话乙");
    expect(html).toContain("2</span>"); // 计数徽标为 2
    // 激活会话行标记 data-active=true，未激活为 false。
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-active="false"');
    // 会话行切换按钮透传 aria-pressed。
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("wires new/close buttons and per-row actions with title attributes", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer
        {...baseProps}
        sessions={[makeSession()]}
        activeSessionId="sess-1"
      />
</MemoryRouter>
    );
    // 新建会话按钮（title 为 i18n key）。
    expect(html).toContain('title="sidebar.newSession"');
    // 行内重命名 / 导出 JSON / 删除按钮。
    expect(html).toContain('title="sidebar.rename"');
    expect(html).toContain('title="sidebar.exportJson"');
    expect(html).toContain('title="sidebar.delete"');
    // 底部导出当前 Markdown 与清理空会话按钮。
    expect(html).toContain("sidebar.exportCurrentMarkdown");
    expect(html).toContain("sidebar.pruneEmpty");
  });

  it("disables export-current-markdown button when no active session", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer {...baseProps} sessions={[makeSession()]} />
</MemoryRouter>
    );
    // activeSessionId 为 null 时导出当前 Markdown 按钮禁用。
    expect(html).toContain("sidebar.exportCurrentMarkdown");
    expect(html).toContain("disabled");
  });

  it("shows pruning label and hint when isPruning", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebarDrawer {...baseProps} isPruning />
</MemoryRouter>
    );
    expect(html).toContain("sidebar.pruning");
    expect(html).toContain("sidebar.pruningHint");
  });
});
