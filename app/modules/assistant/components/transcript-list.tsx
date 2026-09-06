import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Copy, History, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  getNextTranscriptVisibleCount,
  getVisibleTranscriptEntries,
  TRANSCRIPT_ESTIMATED_ROW_SIZE,
  TRANSCRIPT_INITIAL_WINDOW_SIZE,
  TRANSCRIPT_VIRTUAL_OVERSCAN,
} from "@/modules/assistant/lib/conversation";
import type {
  TranscriptEntry,
  TranscriptSpeaker,
} from "@/modules/assistant/types";

type TranscriptListProps = {
  entries: readonly TranscriptEntry[];
  isRetryDisabled: boolean;
  retryableEntryIds: ReadonlySet<string>;
  onRetry: (entryId: string) => void;
};

type CopyStatus = {
  entryId: string;
  state: "success" | "error";
} | null;

const AUTO_SCROLL_THRESHOLD_PX = 48;

function formatEntryTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function getSpeakerLabel(speaker: TranscriptSpeaker, t: (key: string) => string): string {
  if (speaker === "assistant") {
    return "AI";
  }

  if (speaker === "user") {
    return t("transcript.you");
  }

  return t("transcript.system");
}

function TranscriptListComponent({
  entries,
  isRetryDisabled,
  retryableEntryIds,
  onRetry,
}: TranscriptListProps): React.JSX.Element {
  const [visibleCount, setVisibleCount] = useState(
    TRANSCRIPT_INITIAL_WINDOW_SIZE,
  );
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN";
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const [isNearLatest, setIsNearLatest] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousScrollHeightRef = useRef<number | null>(null);
  const previousEntryCountRef = useRef(entries.length);
  const hasInitialScrolledRef = useRef(false);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const newEntryCount = Math.max(
    0,
    entries.length - previousEntryCountRef.current,
  );
  const effectiveVisibleCount =
    visibleCount + (isNearLatest ? 0 : newEntryCount);
  const visibleEntries = getVisibleTranscriptEntries(
    entries,
    effectiveVisibleCount,
  );
  const hiddenEntryCount = Math.max(0, entries.length - visibleEntries.length);

  const rowVirtualizer = useVirtualizer({
    count: visibleEntries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => TRANSCRIPT_ESTIMATED_ROW_SIZE,
    overscan: TRANSCRIPT_VIRTUAL_OVERSCAN,
    getItemKey: (index) => visibleEntries[index]?.id ?? index,
  });

  useLayoutEffect(() => {
    const listElement = listRef.current;
    const previousScrollHeight = previousScrollHeightRef.current;

    if (listElement === null || previousScrollHeight === null) {
      return;
    }

    listElement.scrollTop += listElement.scrollHeight - previousScrollHeight;
    previousScrollHeightRef.current = null;
  }, [visibleCount]);

  useLayoutEffect(() => {
    const listElement = listRef.current;

    if (listElement !== null && !hasInitialScrolledRef.current) {
      listElement.scrollTop = listElement.scrollHeight;
      hasInitialScrolledRef.current = true;
    }
  }, []);

  useEffect(() => {
    const listElement = listRef.current;
    const receivedNewEntry = entries.length > previousEntryCountRef.current;
    previousEntryCountRef.current = entries.length;

    if (listElement !== null && receivedNewEntry && isNearLatest) {
      listElement.scrollTo({ top: listElement.scrollHeight, behavior: "smooth" });
    }

    if (receivedNewEntry && !isNearLatest) {
      setVisibleCount((current) => current + newEntryCount);
    }
  }, [entries.length, isNearLatest, newEntryCount]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleListScroll = (): void => {
    const listElement = listRef.current;

    if (listElement === null) {
      return;
    }

    const distanceFromLatest =
      listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight;
    setIsNearLatest(distanceFromLatest <= AUTO_SCROLL_THRESHOLD_PX);
  };

  const handleShowEarlier = (): void => {
    const listElement = listRef.current;

    if (listElement !== null) {
      previousScrollHeightRef.current = listElement.scrollHeight;
    }

    setVisibleCount((current) =>
      getNextTranscriptVisibleCount(current, entries.length),
    );
  };

  const handleJumpToLatest = (): void => {
    const listElement = listRef.current;

    if (listElement !== null) {
      listElement.scrollTo({ top: listElement.scrollHeight, behavior: "smooth" });
    }

    setIsNearLatest(true);
  };

  const handleCopy = async (entry: TranscriptEntry): Promise<void> => {
    try {
      if (navigator.clipboard === undefined) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(entry.text);
      setCopyStatus({ entryId: entry.id, state: "success" });
    } catch {
      setCopyStatus({ entryId: entry.id, state: "error" });
    }

    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }

    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyStatus(null);
    }, 2_000);
  };

  const virtualItems = rowVirtualizer.getVirtualItems();

  if (entries.length === 0) {
    return (
      <div
        className="grid min-h-[180px] place-content-center justify-items-center gap-2 rounded-md border border-dashed border-border bg-grid-line p-6 text-center text-soft-fg-muted"
        role="status"
      >
        <History size={24} aria-hidden="true" />
        <strong className="text-foreground">{t("conversation.startNew")}</strong>
        <span className="max-w-[38ch] text-[0.84rem] leading-[1.5]">
          {t("transcript.emptyHint")}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-col overflow-hidden">
      {hiddenEntryCount > 0 ? (
        <button
          className="my-2 inline-flex min-h-[30px] cursor-pointer items-center justify-center gap-1.5 self-center rounded-lg border border-white/10 bg-white/[0.04] px-[9px] py-[5px] text-[0.76rem] font-[600] text-soft-fg-bright transition-[background,border-color] duration-[200ms] hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          type="button"
          onClick={handleShowEarlier}
        >
          <History size={15} aria-hidden="true" />
          {t("transcript.showEarlier", { count: hiddenEntryCount })}
        </button>
      ) : null}

      <div
        ref={listRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onScroll={handleListScroll}
      >
        <ol
          className="relative m-0 w-full list-none p-0"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          aria-live="polite"
        >
          {virtualItems.map((virtualRow) => {
            const entry = visibleEntries[virtualRow.index];
            const canRetry = retryableEntryIds.has(entry.id);
            const currentCopyStatus =
              copyStatus?.entryId === entry.id ? copyStatus.state : null;
            const isUser = entry.speaker === "user";
            const isAssistant = entry.speaker === "assistant";
            const isFailed = entry.deliveryStatus === "failed";

            return (
              <li
                className="absolute left-0 top-0 w-full pb-2.5 box-border"
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                key={entry.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className={`grid gap-1.5 rounded-md border-l-4 bg-soft-bg p-3 ${
                    isUser
                      ? "border-l-primary"
                      : isAssistant
                        ? "border-l-destructive"
                        : "border-l-accent"
                  } ${isFailed ? "border-l-destructive bg-danger-soft-bg" : ""}`}
                  data-delivery-status={entry.deliveryStatus}
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-foreground">{getSpeakerLabel(entry.speaker, t)}</strong>
                    <div className="flex items-center gap-2">
                      {entry.deliveryStatus === "failed" ? (
                        <span className="text-[0.72rem] font-[600] text-danger-text">{t("conversation.sendFailed")}</span>
                      ) : null}
                      <time className="text-[0.78rem] text-soft-fg-muted" dateTime={new Date(entry.createdAt).toISOString()}>
                        {formatEntryTime(entry.createdAt, locale)}
                      </time>
                    </div>
                  </div>
                  <p className="m-0 leading-[1.45] text-soft-fg-bright">{entry.text}</p>
                  <div className="flex min-h-0 items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(entry)}
                      aria-label={t("transcript.copyWithSpeaker", { speaker: getSpeakerLabel(entry.speaker, t) })}
                      className="inline-flex min-h-[26px] cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-[7px] py-[3px] text-[0.76rem] font-[600] text-soft-fg-bright transition-[background,color] duration-[200ms] hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Copy size={14} aria-hidden="true" />
                      {currentCopyStatus === "success"
                        ? t("transcript.copied")
                        : currentCopyStatus === "error"
                          ? t("transcript.copyFailed")
                          : t("transcript.copy")}
                    </button>
                    {canRetry ? (
                      <button
                        type="button"
                        onClick={() => onRetry(entry.id)}
                        disabled={isRetryDisabled}
                        className="inline-flex min-h-[26px] cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-[7px] py-[3px] text-[0.76rem] font-[600] text-soft-fg-bright transition-[background,color] duration-[200ms] hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <RefreshCcw size={14} aria-hidden="true" />
                        {t("transcript.retry")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {!isNearLatest ? (
        <button
          className="absolute bottom-3 right-3 inline-flex min-h-[30px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border-0 bg-[color:var(--color-primary)] px-[9px] py-[5px] text-[0.76rem] font-[600] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3)] transition-[background,box-shadow] duration-[200ms] hover:bg-[#6872d9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          type="button"
          onClick={handleJumpToLatest}
        >
          <ArrowDown size={15} aria-hidden="true" />
          {t("transcript.backToLatest")}
        </button>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {copyStatus?.state === "success"
          ? t("transcript.copiedLive")
          : copyStatus?.state === "error"
            ? t("transcript.copyErrorLive")
            : ""}
      </span>
    </div>
  );
}

export const TranscriptList = memo(TranscriptListComponent);
