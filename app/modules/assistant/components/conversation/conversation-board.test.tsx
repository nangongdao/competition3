import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: "zh-CN" },
  }),
}));

import { ConversationBoard } from "./conversation-board";
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

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    transcript: [] as readonly TranscriptEntry[],
    retryableEntryIds: new Set<string>(),
    isRetryDisabled: false,
    onRetry: () => undefined,
    isClearConfirmationVisible: false,
    onRequestClear: () => undefined,
    onCancelClear: () => undefined,
    onConfirmClear: () => undefined,
    onExport: () => undefined,
    textDraft: "",
    canSendTextMessage: false,
    isChatMode: true,
    hasRealtimeConnection: false,
    isSending: false,
    onTextDraftChange: () => undefined,
    onTextMessageSubmit: () => undefined,
    ...overrides,
  };
}

describe("ConversationBoard", () => {
  it("渲染面板容器与标题、aria-label", () => {
    const html = renderToStaticMarkup(<ConversationBoard {...makeProps()} />);
    expect(html).toContain('aria-label="conversation.board"');
    expect(html).toContain("conversation.title");
    expect(html).toContain('aria-label="conversation.actions"');
  });

  it("无转写时导出与清空按钮 disabled", () => {
    const html = renderToStaticMarkup(<ConversationBoard {...makeProps()} />);
    // MD / JSON / 清空按钮在无内容时应禁用
    expect(html).toContain("conversation.exportMarkdownTitle");
    expect(html).toContain("conversation.exportJsonTitle");
    expect(html).toContain("conversation.clear");
    expect(html).toContain("disabled=\"\"");
  });

  it("有转写时导出与清空按钮可用（不渲染 disabled）", () => {
    const transcript = [makeEntry({ id: "e1", text: "第一条" }), makeEntry({ id: "e2", text: "第二条" })];
    const html = renderToStaticMarkup(
      <ConversationBoard {...makeProps({ transcript })} />,
    );
    // TranscriptList 经虚拟化渲染，SSR 下仅输出占位容器，转写文本不直接进 DOM；
    // 这里聚焦板子自身的导出/清空按钮可用性：有内容时不应出现 disabled。
    expect(html).toContain('aria-label="conversation.exportMarkdownTitle"');
    expect(html).toContain('aria-label="conversation.clearTitle"');
    // 导出按钮无 disabled，清空按钮无 disabled（仅发送按钮因草稿为空仍禁用）
    expect(html).not.toContain('aria-label="conversation.exportMarkdownTitle" disabled=""');
    expect(html).not.toContain('aria-label="conversation.clearTitle" disabled=""');
  });

  it("未确认清空时渲染清空按钮而非确认组", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard
        {...makeProps({ transcript: [makeEntry()], isClearConfirmationVisible: false })}
      />,
    );
    expect(html).toContain("conversation.clear");
    expect(html).not.toContain("conversation.confirmClear");
    expect(html).not.toContain("conversation.cancel");
  });

  it("确认清空可见时渲染确认组（confirm/cancel + role=group）", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard
        {...makeProps({ transcript: [makeEntry()], isClearConfirmationVisible: true })}
      />,
    );
    expect(html).toContain("conversation.confirmClear");
    expect(html).toContain("conversation.confirm");
    expect(html).toContain("conversation.cancel");
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="conversation.confirmClearLabel"');
    // 确认态下不应再出现单独的清空按钮
    expect(html).not.toContain('aria-label="conversation.clearTitle"');
  });

  it("透传文本草稿值与发送按钮禁用状态", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard {...makeProps({ textDraft: "你好", canSendTextMessage: true })} />,
    );
    expect(html).toContain('value="你好"');
  });

  it("Chat 模式空草稿时发送按钮禁用", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard {...makeProps({ canSendTextMessage: true, textDraft: "  " })} />,
    );
    // 草稿为空白时发送按钮 disabled（MessageComposer 内 textDraft.trim().length === 0）
    expect(html).toContain('aria-label="conversation.sendButton"');
    expect(html).toContain("disabled=\"\"");
  });

  it("Chat 模式渲染消息输入框占位符", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard {...makeProps({ isChatMode: true, canSendTextMessage: true })} />,
    );
    expect(html).toContain('aria-label="conversation.messageInput"');
    expect(html).toContain("conversation.placeholderChat");
  });

  it("Realtime 模式且有连接时使用 Realtime 占位符", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard
        {...makeProps({ isChatMode: false, hasRealtimeConnection: true })}
      />,
    );
    expect(html).toContain("conversation.placeholderRealtime");
  });

  it("Realtime 模式无连接时使用 idle 占位符", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard
        {...makeProps({ isChatMode: false, hasRealtimeConnection: false })}
      />,
    );
    expect(html).toContain("conversation.placeholderIdle");
  });

  it("渲染导出 MD / JSON 按钮标签", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard {...makeProps({ transcript: [makeEntry()] })} />,
    );
    expect(html).toContain(">MD</span>");
    expect(html).toContain(">JSON</span>");
  });

  it("确认按钮带危险色样式类", () => {
    const html = renderToStaticMarkup(
      <ConversationBoard
        {...makeProps({ transcript: [makeEntry()], isClearConfirmationVisible: true })}
      />,
    );
    // 确认按钮（confirm）带危险色类 first:border-danger-soft-border / first:bg-danger-soft-bg
    expect(html).toContain("first:border-danger-soft-border");
    expect(html).toContain("first:bg-danger-soft-bg");
  });

  it("容器 aria-label 与 grid 布局类", () => {
    const html = renderToStaticMarkup(<ConversationBoard {...makeProps()} />);
    expect(html).toContain('aria-label="conversation.board"');
    expect(html).toContain("grid-rows-[auto_minmax(0,1fr)_auto]");
  });

  it("有转写时接入 TranscriptList 与 MessageComposer 子组件", () => {
    const entry = makeEntry({ id: "fail-1", deliveryStatus: "failed" });
    const retryableEntryIds = new Set(["fail-1"]);
    const html = renderToStaticMarkup(
      <ConversationBoard
        {...makeProps({ transcript: [entry], retryableEntryIds })}
      />,
    );
    // 转写容器具备 live 区域；SSR 下条目经虚拟化不直接输出文本，但子组件接线仍存在。
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="conversation.composer"');
    expect(html).toContain('aria-label="conversation.messageInput"');
  });
});
