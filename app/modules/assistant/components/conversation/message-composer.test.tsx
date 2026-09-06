import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 隔离 i18n：用固定实现替换 useTranslation，避免 node 环境下的 i18n 初始化依赖。
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MessageComposer } from "./message-composer";

describe("MessageComposer", () => {
  const baseProps = {
    textDraft: "",
    canSendTextMessage: true,
    isChatMode: true,
    hasRealtimeConnection: false,
    isSending: false,
    onChange: () => undefined,
    onSubmit: (event: React.FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
  };

  it("Chat 模式下使用 Chat 占位符", () => {
    const html = renderToStaticMarkup(
      <MessageComposer {...baseProps} isChatMode={true} />,
    );
    expect(html).toContain("conversation.placeholderChat");
  });

  it("Realtime 已连接时使用 Realtime 占位符", () => {
    const html = renderToStaticMarkup(
      <MessageComposer
        {...baseProps}
        isChatMode={false}
        hasRealtimeConnection={true}
      />,
    );
    expect(html).toContain("conversation.placeholderRealtime");
  });

  it("空闲时使用 idle 占位符", () => {
    const html = renderToStaticMarkup(
      <MessageComposer
        {...baseProps}
        isChatMode={false}
        hasRealtimeConnection={false}
      />,
    );
    expect(html).toContain("conversation.placeholderIdle");
  });

  it("草稿为空时禁用发送按钮", () => {
    const html = renderToStaticMarkup(
      <MessageComposer {...baseProps} textDraft="" />,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain("disabled");
  });

  it("发送中展示 sending 文案", () => {
    const html = renderToStaticMarkup(
      <MessageComposer
        {...baseProps}
        textDraft="你好"
        isSending={true}
      />,
    );
    expect(html).toContain("conversation.sending");
  });

  it("禁用时输入框与按钮不可用", () => {
    const html = renderToStaticMarkup(
      <MessageComposer
        {...baseProps}
        textDraft="你好"
        canSendTextMessage={false}
      />,
    );
    expect(html).toContain('disabled=""');
  });
});
