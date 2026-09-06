import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { SessionSidebar } from "./sidebar";
import type { SessionSummary } from "@/modules/assistant/lib/session-client";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "sess-1",
    title: "演示会话",
    providerMode: "chat",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    messageCount: 3,
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    sessions: [] as readonly SessionSummary[],
    activeSessionId: null,
    onNew: () => undefined,
    onSwitch: () => undefined,
    onRename: () => undefined,
    onRemove: () => undefined,
    onExport: () => undefined,
    onPrune: () => undefined,
    onClose: () => undefined,
    isPruning: false,
    ...overrides,
  };
}

describe("SessionSidebar", () => {
  it("渲染侧边栏标题与 aria-label", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebar {...makeProps()} />
</MemoryRouter>
    );
    expect(html).toContain('aria-label="sidebar.title"');
    expect(html).toContain("sidebar.sessions");
  });

  it("无会话时渲染空态提示", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebar {...makeProps({ sessions: [] })} />
</MemoryRouter>
    );
    expect(html).toContain("sidebar.emptyTitle");
    expect(html).toContain("sidebar.emptyHint");
  });

  it("渲染会话列表与计数徽标", () => {
    const sessions = [makeSession(), makeSession({ id: "sess-2", title: "第二会话" })];
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebar {...makeProps({ sessions })} />
</MemoryRouter>
    );
    expect(html).toContain("演示会话");
    expect(html).toContain("第二会话");
    expect(html).toContain(">2<");
  });

  it("当前会话标记 data-active=true，其余为 false", () => {
    const sessions = [makeSession({ id: "sess-1" }), makeSession({ id: "sess-2" })];
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebar {...makeProps({ sessions, activeSessionId: "sess-1" })} />
</MemoryRouter>
    );
    // 至少出现一个 data-active="true"
    expect(html).toContain('data-active="true"');
    expect(html).toContain('data-active="false"');
  });

  it("会话按更新时间倒序排序（新会话在前）", () => {
    const sessions = [
      makeSession({ id: "older", title: "旧会话", updatedAt: 1_000_000_000_000 }),
      makeSession({ id: "newer", title: "新会话", updatedAt: 1_700_000_000_000 }),
    ];
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebar {...makeProps({ sessions })} />
</MemoryRouter>
    );
    // 排序后新会话应排在旧会话之前
    const newerIdx = html.indexOf("新会话");
    const olderIdx = html.indexOf("旧会话");
    expect(newerIdx).toBeGreaterThan(-1);
    expect(olderIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it("渲染新建与会话数按钮，空态不渲染具体会话操作", () => {
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebar {...makeProps({ sessions: [] })} />
</MemoryRouter>
    );
    expect(html).toContain("sidebar.new");
    expect(html).toContain("sidebar.closeSidebar");
  });

  it("透传全局累计用量到 GlobalUsagePanel", () => {
    const globalUsageTotals = {
      turnCount: 3,
      inputTokens: 5000,
      inputTextTokens: 1000,
      inputAudioTokens: 2000,
      inputImageTokens: 2000,
      cachedInputTokens: 0,
      cachedTextTokens: 0,
      cachedAudioTokens: 0,
      cachedImageTokens: 0,
      outputTokens: 200,
      outputTextTokens: 100,
      outputAudioTokens: 100,
      estimatedCostUsd: 0.001,
    };
    const html = renderToStaticMarkup(
<MemoryRouter>
      <SessionSidebar
        {...makeProps({ sessions: [], globalUsageTotals })}
      />
</MemoryRouter>
    );
    expect(html).toContain('aria-label="usage.globalPanel"');
    expect(html).toContain("usage.globalTitle");
    expect(html).toContain("5.0k"); // formatTokens(5000)
  });
});
