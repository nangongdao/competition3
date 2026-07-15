import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Copy, History, RefreshCcw } from "lucide-react";

import {
  getNextTranscriptVisibleCount,
  getVisibleTranscriptEntries,
  TRANSCRIPT_INITIAL_WINDOW_SIZE,
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

function formatEntryTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

function getSpeakerLabel(speaker: TranscriptSpeaker): string {
  if (speaker === "assistant") {
    return "AI";
  }

  if (speaker === "user") {
    return "你";
  }

  return "系统";
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
  const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
  const [isNearLatest, setIsNearLatest] = useState(true);
  const listRef = useRef<HTMLOListElement | null>(null);
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

  if (entries.length === 0) {
    return (
      <div className="transcript-empty" role="status">
        <History size={24} aria-hidden="true" />
        <strong>开始一段新对话</strong>
        <span>发送文字、语音或画面问题后，消息会显示在这里。</span>
      </div>
    );
  }

  return (
    <div className="transcript-scroll-region">
      <ol
        ref={listRef}
        className="transcript-list"
        aria-live="polite"
        onScroll={handleListScroll}
      >
        {hiddenEntryCount > 0 ? (
          <li className="transcript-history-control">
            <button type="button" onClick={handleShowEarlier}>
              <History size={15} aria-hidden="true" />
              显示更早消息（还有 {hiddenEntryCount} 条）
            </button>
          </li>
        ) : null}

        {visibleEntries.map((entry) => {
          const canRetry = retryableEntryIds.has(entry.id);
          const currentCopyStatus =
            copyStatus?.entryId === entry.id ? copyStatus.state : null;

          return (
            <li
              className={`transcript-entry ${entry.speaker}`}
              data-delivery-status={entry.deliveryStatus}
              key={entry.id}
            >
              <div className="transcript-entry-heading">
                <strong>{getSpeakerLabel(entry.speaker)}</strong>
                <div className="transcript-entry-meta">
                  {entry.deliveryStatus === "failed" ? (
                    <span className="transcript-failed-label">发送失败</span>
                  ) : null}
                  <time dateTime={new Date(entry.createdAt).toISOString()}>
                    {formatEntryTime(entry.createdAt)}
                  </time>
                </div>
              </div>
              <p>{entry.text}</p>
              <div className="transcript-entry-actions">
                <button
                  type="button"
                  onClick={() => void handleCopy(entry)}
                  aria-label={`复制${getSpeakerLabel(entry.speaker)}消息`}
                >
                  <Copy size={14} aria-hidden="true" />
                  {currentCopyStatus === "success"
                    ? "已复制"
                    : currentCopyStatus === "error"
                      ? "复制失败"
                      : "复制"}
                </button>
                {canRetry ? (
                  <button
                    type="button"
                    onClick={() => onRetry(entry.id)}
                    disabled={isRetryDisabled}
                  >
                    <RefreshCcw size={14} aria-hidden="true" />
                    重试
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {!isNearLatest ? (
        <button
          className="transcript-jump-latest"
          type="button"
          onClick={handleJumpToLatest}
        >
          <ArrowDown size={15} aria-hidden="true" />
          回到最新
        </button>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {copyStatus?.state === "success"
          ? "消息已复制到剪贴板"
          : copyStatus?.state === "error"
            ? "无法复制消息，请检查浏览器权限"
            : ""}
      </span>
    </div>
  );
}

export const TranscriptList = memo(TranscriptListComponent);
