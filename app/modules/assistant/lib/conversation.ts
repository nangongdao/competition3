import type { TranscriptEntry } from "@/modules/assistant/types";

export const TRANSCRIPT_INITIAL_WINDOW_SIZE = 40;
export const TRANSCRIPT_WINDOW_STEP = 30;

/** 转写条目平均高度估算（px），用于虚拟化 estimateSize 的初始值，随后由 measureElement 精确测量。 */
export const TRANSCRIPT_ESTIMATED_ROW_SIZE = 112;
/** 转写条目行间间距（px），计入估算行高。 */
export const TRANSCRIPT_ROW_GAP = 10;
/** 虚拟化视口外预渲染行数，减少滚动白屏。 */
export const TRANSCRIPT_VIRTUAL_OVERSCAN = 6;

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
