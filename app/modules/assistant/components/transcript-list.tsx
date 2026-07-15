import { memo } from "react";

import type {
  TranscriptEntry,
  TranscriptSpeaker,
} from "@/modules/assistant/types";

type TranscriptListProps = {
  entries: readonly TranscriptEntry[];
};

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

function TranscriptListComponent({ entries }: TranscriptListProps): React.JSX.Element {
  return (
    <ol className="transcript-list" aria-live="polite">
      {entries.map((entry) => (
        <li className={`transcript-entry ${entry.speaker}`} key={entry.id}>
          <div>
            <strong>{getSpeakerLabel(entry.speaker)}</strong>
            <time dateTime={new Date(entry.createdAt).toISOString()}>
              {formatEntryTime(entry.createdAt)}
            </time>
          </div>
          <p>{entry.text}</p>
        </li>
      ))}
    </ol>
  );
}

export const TranscriptList = memo(TranscriptListComponent);
