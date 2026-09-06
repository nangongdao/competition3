import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { TranscriptList } from "./transcript-list";
import type { TranscriptEntry } from "@/modules/assistant/types";

function makeEntry(overrides: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return {
    id: "entry-1",
    speaker: "user",
    text: "这是一条测试消息",
    createdAt: 1_700_000_000_000,
    deliveryStatus: "sent",
    ...overrides,
  };
}

describe("TranscriptList", () => {
  it("空转写时渲染空状态提示与 role=status", () => {
    const html = renderToStaticMarkup(
      <TranscriptList
        entries={[]}
        isRetryDisabled={false}
        retryableEntryIds={new Set()}
        onRetry={() => undefined}
      />,
    );
    expect(html).toContain("conversation.startNew");
    expect(html).toContain("transcript.emptyHint");
    expect(html).toContain('role="status"');
  });

  it("有转写但未超窗口时不渲染 show earlier 按钮", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: `entry-${i}`, text: `消息 ${i}` }),
    );
    const html = renderToStaticMarkup(
      <TranscriptList
        entries={entries}
        isRetryDisabled={false}
        retryableEntryIds={new Set()}
        onRetry={() => undefined}
      />,
    );
    // 5 条 < 初始窗口 40，无隐藏条目，不应有 show earlier
    expect(html).not.toContain("transcript.showEarlier");
  });

  it("条目数超过初始窗口时渲染 show earlier 按钮（含计数）", () => {
    const entries = Array.from({ length: 50 }, (_, i) =>
      makeEntry({ id: `entry-${i}`, text: `消息 ${i}` }),
    );
    const html = renderToStaticMarkup(
      <TranscriptList
        entries={entries}
        isRetryDisabled={false}
        retryableEntryIds={new Set()}
        onRetry={() => undefined}
      />,
    );
    // 50 条 > 初始窗口 40，存在隐藏条目
    expect(html).toContain("transcript.showEarlier");
  });

  it("容器具备无障碍 live 区域与滚动语义", () => {
    const entries = [makeEntry()];
    const html = renderToStaticMarkup(
      <TranscriptList
        entries={entries}
        isRetryDisabled={false}
        retryableEntryIds={new Set()}
        onRetry={() => undefined}
      />,
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("<ol");
  });

  it("为空态提供历史图标与引导文案", () => {
    const html = renderToStaticMarkup(
      <TranscriptList
        entries={[]}
        isRetryDisabled={false}
        retryableEntryIds={new Set()}
        onRetry={() => undefined}
      />,
    );
    // lucide 图标渲染为 svg
    expect(html).toContain("<svg");
  });
});
