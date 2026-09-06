import { memo } from "react";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";

type MessageComposerProps = {
  textDraft: string;
  canSendTextMessage: boolean;
  isChatMode: boolean;
  hasRealtimeConnection: boolean;
  isSending: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

/**
 * 文本消息输入框 + 发送按钮。
 */
export const MessageComposer = memo(function MessageComposer({
  textDraft,
  canSendTextMessage,
  isChatMode,
  hasRealtimeConnection,
  isSending,
  onChange,
  onSubmit,
}: MessageComposerProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <form
      className="flex gap-2.5"
      onSubmit={onSubmit}
      aria-label={t("conversation.composer")}
    >
      <input
        type="text"
        value={textDraft}
        onChange={onChange}
        placeholder={
          isChatMode
            ? t("conversation.placeholderChat")
            : hasRealtimeConnection
              ? t("conversation.placeholderRealtime")
              : t("conversation.placeholderIdle")
        }
        disabled={!canSendTextMessage}
        aria-label={t("conversation.messageInput")}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-foreground placeholder:text-soft-fg-muted transition-[border-color,box-shadow] duration-[200ms] focus:border-[color:var(--color-primary)] focus:shadow-[0_0_0_3px_rgba(94,106,210,0.15)] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-soft-fg-muted"
      />
      <button
        type="submit"
        disabled={!canSendTextMessage || textDraft.trim().length === 0}
        aria-label={t("conversation.sendButton")}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-0 bg-[color:var(--color-primary)] px-4 py-2.5 font-[600] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-[background,box-shadow,transform] duration-[200ms] ease-[cubic-bezier(0.16,1,0.3,1)] enabled:hover:bg-[#6872d9] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-warn-bg disabled:text-soft-fg-muted"
      >
        <Send size={16} aria-hidden="true" />
        <span>{isSending ? t("conversation.sending") : t("conversation.send")}</span>
      </button>
    </form>
  );
});
