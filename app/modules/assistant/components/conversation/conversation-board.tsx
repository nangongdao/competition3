import { memo } from "react";
import { FileJson, FileText, Trash2, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TranscriptList } from "@/modules/assistant/components/transcript-list";
import { MessageComposer } from "@/modules/assistant/components/conversation/message-composer";
import type { TranscriptEntry } from "@/modules/assistant/types";

type ConversationBoardProps = {
  transcript: readonly TranscriptEntry[];
  retryableEntryIds: ReadonlySet<string>;
  isRetryDisabled: boolean;
  onRetry: (entryId: string) => void;
  isClearConfirmationVisible: boolean;
  onRequestClear: () => void;
  onCancelClear: () => void;
  onConfirmClear: () => void;
  onExport: (format: "json" | "md") => void;
  textDraft: string;
  canSendTextMessage: boolean;
  isChatMode: boolean;
  hasRealtimeConnection: boolean;
  isSending: boolean;
  onTextDraftChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTextMessageSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

const actionButtonClassName =
  "inline-flex min-h-[30px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-soft-bg px-[9px] py-[5px] text-[0.76rem] font-[600] text-soft-fg-bright transition-[background,border-color,color] duration-[200ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary enabled:hover:border-white/20 enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45";

export const ConversationBoard = memo(function ConversationBoard({
  transcript,
  retryableEntryIds,
  isRetryDisabled,
  onRetry,
  isClearConfirmationVisible,
  onRequestClear,
  onCancelClear,
  onConfirmClear,
  onExport,
  textDraft,
  canSendTextMessage,
  isChatMode,
  hasRealtimeConnection,
  isSending,
  onTextDraftChange,
  onTextMessageSubmit,
}: ConversationBoardProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className="grid min-h-[320px] gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-[18px] text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] grid-rows-[auto_minmax(0,1fr)_auto]"
      aria-label={t("conversation.board")}
    >
      <div className="flex items-center justify-between gap-3 max-[480px]:flex-col max-[480px]:items-start">
        <div className="text-accent">
          <Volume2 size={18} aria-hidden="true" />
          <span>{t("conversation.title")}</span>
        </div>
        <div
          className="flex flex-wrap justify-end gap-1.5 max-[480px]:w-full max-[480px]:justify-start"
          aria-label={t("conversation.actions")}
        >
          <button
            type="button"
            onClick={() => onExport("md")}
            disabled={transcript.length === 0}
            title={t("conversation.exportMarkdownTitle")}
            aria-label={t("conversation.exportMarkdownTitle")}
            className={actionButtonClassName}
          >
            <FileText size={15} aria-hidden="true" />
            <span>MD</span>
          </button>
          <button
            type="button"
            onClick={() => onExport("json")}
            disabled={transcript.length === 0}
            title={t("conversation.exportJsonTitle")}
            aria-label={t("conversation.exportJsonTitle")}
            className={actionButtonClassName}
          >
            <FileJson size={15} aria-hidden="true" />
            <span>JSON</span>
          </button>
          {isClearConfirmationVisible ? (
            <div
              className="flex items-center gap-[5px] pl-1.5 text-[0.76rem] font-[600] text-danger-text max-[480px]:flex-wrap max-[480px]:pl-0"
              role="group"
              aria-label={t("conversation.confirmClearLabel")}
            >
              <span>{t("conversation.confirmClear")}</span>
              <button
                type="button"
                onClick={onConfirmClear}
                className={`${actionButtonClassName} first:border-danger-soft-border first:bg-danger-soft-bg first:text-foreground`}
              >
                {t("conversation.confirm")}
              </button>
              <button type="button" onClick={onCancelClear} className={actionButtonClassName}>
                {t("conversation.cancel")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onRequestClear}
              disabled={transcript.length === 0}
              title={t("conversation.clearTitle")}
              aria-label={t("conversation.clearTitle")}
              className={`${actionButtonClassName} enabled:text-danger-text`}
            >
              <Trash2 size={15} aria-hidden="true" />
              <span>{t("conversation.clear")}</span>
            </button>
          )}
        </div>
      </div>

      <TranscriptList
        entries={transcript}
        isRetryDisabled={isRetryDisabled}
        retryableEntryIds={retryableEntryIds}
        onRetry={onRetry}
      />

      <MessageComposer
        textDraft={textDraft}
        canSendTextMessage={canSendTextMessage}
        isChatMode={isChatMode}
        hasRealtimeConnection={hasRealtimeConnection}
        isSending={isSending}
        onChange={onTextDraftChange}
        onSubmit={onTextMessageSubmit}
      />
    </div>
  );
});
