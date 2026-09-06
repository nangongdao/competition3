import type { MessageRole, SessionMessage } from "@/modules/assistant/lib/session-client";

export type SessionExportFormat = "json" | "md";

export type SessionExportDocument = {
  version: 1;
  exportedAt: number;
  sessionId: string;
  title: string;
  messages: readonly {
    id: string;
    role: MessageRole;
    content: string;
    modality: SessionMessage["modality"];
    createdAt: number;
  }[];
};

function getSpeakerExportLabel(role: MessageRole): string {
  if (role === "assistant") {
    return "AI";
  }

  if (role === "user") {
    return "User";
  }

  return "System";
}

/**
 * 将持久化会话消息序列化为 Markdown 导出文本。
 *
 * 纯函数，便于单测。每条消息带角色标签与 ISO 时间戳。
 */
export function serializeSessionMarkdown(
  sessionId: string,
  title: string,
  messages: readonly SessionMessage[],
  exportedAt: number,
): string {
  const lines = [
    "# Session Export",
    "",
    `Title: ${title}`,
    `Session: ${sessionId}`,
    `Exported: ${new Date(exportedAt).toISOString()}`,
    "",
  ];

  if (messages.length === 0) {
    lines.push("_No messages in this session._", "");
    return lines.join("\n");
  }

  for (const message of messages) {
    lines.push(
      `## ${getSpeakerExportLabel(message.role)} · ${new Date(message.createdAt).toISOString()}`,
      "",
      message.content,
      "",
    );
  }

  return lines.join("\n");
}

/**
 * 将持久化会话消息序列化为 JSON 导出文本。
 *
 * 纯函数，便于单测。保留完整元数据（角色/模态/时间戳）。
 */
export function serializeSessionJson(
  sessionId: string,
  title: string,
  messages: readonly SessionMessage[],
  exportedAt: number,
): string {
  const document: SessionExportDocument = {
    version: 1,
    exportedAt,
    sessionId,
    title,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      modality: message.modality,
      createdAt: message.createdAt,
    })),
  };

  return JSON.stringify(document, null, 2);
}

/** 生成会话导出文件名（含时间戳）。 */
export function createSessionExportFilename(
  exportedAt: number,
  extension: "json" | "md",
): string {
  const timestamp = new Date(exportedAt).toISOString().replaceAll(":", "-");
  return `session-export-${timestamp}.${extension}`;
}
