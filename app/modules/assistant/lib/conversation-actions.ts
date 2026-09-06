import type { TranscriptEntry } from "@/modules/assistant/types";
import {
  createConversationExportFilename,
  serializeConversationJson,
  serializeConversationMarkdown,
} from "@/modules/assistant/lib/conversation";

/** 支持的会话导出格式。 */
export type ConversationExportFormat = "json" | "md";

/** 会话导出负载：内容、MIME 类型与文件名。 */
export type ConversationExportPayload = {
  content: string;
  mimeType: string;
  filename: string;
};

const EXPORT_MIME_TYPE: Record<ConversationExportFormat, string> = {
  json: "application/json",
  md: "text/markdown",
};

/**
 * 计算会话导出负载（纯函数）。
 *
 * 按格式序列化转写条目并生成下载文件名，返回内容 / MIME / 文件名三元组，
 * 供调用方直接触发下载。`exportedAt` 由调用方注入以便单测确定性。
 */
export function resolveConversationExport(
  format: ConversationExportFormat,
  entries: readonly TranscriptEntry[],
  exportedAt: number,
): ConversationExportPayload {
  const content =
    format === "json"
      ? serializeConversationJson(entries, exportedAt)
      : serializeConversationMarkdown(entries, exportedAt);

  return {
    content,
    mimeType: EXPORT_MIME_TYPE[format],
    filename: createConversationExportFilename(exportedAt, format),
  };
}
