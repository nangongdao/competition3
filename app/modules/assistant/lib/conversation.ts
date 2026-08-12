import type { TranscriptEntry } from "@/modules/assistant/types";

export const TRANSCRIPT_INITIAL_WINDOW_SIZE = 40;
export const TRANSCRIPT_WINDOW_STEP = 30;

export type ConversationExport = {
  version: 1;
  exportedAt: number;
  entries: readonly TranscriptEntry[];
};

export function isChatTurnRetryAllowed(
  hasRetryPayload: boolean,
  isChatRequestInFlight: boolean,
): boolean {
  return hasRetryPayload && !isChatRequestInFlight;
}

export function getVisibleTranscriptEntries(
  entries: readonly TranscriptEntry[],
  visibleCount: number,
): readonly TranscriptEntry[] {
  const safeVisibleCount = Math.max(0, Math.floor(visibleCount));
  return entries.slice(Math.max(0, entries.length - safeVisibleCount));
}

export function getNextTranscriptVisibleCount(
  currentVisibleCount: number,
  totalCount: number,
  step = TRANSCRIPT_WINDOW_STEP,
): number {
  const safeCurrent = Math.max(0, Math.floor(currentVisibleCount));
  const safeTotal = Math.max(0, Math.floor(totalCount));
  const safeStep = Math.max(1, Math.floor(step));
  return Math.min(safeTotal, safeCurrent + safeStep);
}

function getSpeakerExportLabel(entry: TranscriptEntry): string {
  if (entry.speaker === "assistant") {
    return "AI";
  }

  if (entry.speaker === "user") {
    return "User";
  }

  return "System";
}

export function serializeConversationMarkdown(
  entries: readonly TranscriptEntry[],
  exportedAt: number,
): string {
  const lines = [
    "# Conversation Export",
    "",
    `Exported: ${new Date(exportedAt).toISOString()}`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("_No conversation entries._", "");
    return lines.join("\n");
  }

  for (const entry of entries) {
    lines.push(
      `## ${getSpeakerExportLabel(entry)} · ${new Date(entry.createdAt).toISOString()}`,
      "",
      entry.text,
      "",
    );
  }

  return lines.join("\n");
}

export function serializeConversationJson(
  entries: readonly TranscriptEntry[],
  exportedAt: number,
): string {
  const exportValue: ConversationExport = {
    version: 1,
    exportedAt,
    entries: entries.map((entry) => ({
      id: entry.id,
      speaker: entry.speaker,
      text: entry.text,
      createdAt: entry.createdAt,
      ...(entry.deliveryStatus === undefined
        ? {}
        : { deliveryStatus: entry.deliveryStatus }),
    })),
  };

  return JSON.stringify(exportValue, null, 2);
}

export function createConversationExportFilename(
  exportedAt: number,
  extension: "json" | "md",
): string {
  const timestamp = new Date(exportedAt).toISOString().replaceAll(":", "-");
  return `assistant-conversation-${timestamp}.${extension}`;
}
