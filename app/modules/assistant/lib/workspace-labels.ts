import type {
  AssistantPhase,
  MediaPermissionStatus,
  RealtimeConnectionStatus,
} from "@/modules/assistant/types";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";
import type {
  ProviderMode,
  VisionCapability,
} from "../../../../src/worker/routes/provider/types";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";

/**
 * 工作台状态标签的 i18n key 映射。
 * 值为 i18next 翻译 key（见 app/i18n/locales/*.json 的 labels.* 命名空间），
 * 组件内通过 `t(key)` 解析为当前语言文案。
 */
export const phaseLabels: Record<AssistantPhase, string> = {
  idle: "labels.phase.idle",
  ready: "labels.phase.ready",
  connecting: "labels.phase.connecting",
  listening: "labels.phase.listening",
  thinking: "labels.phase.thinking",
  responding: "labels.phase.responding",
  error: "labels.phase.error",
};

export const mediaLabels: Record<MediaPermissionStatus, string> = {
  idle: "labels.media.idle",
  requesting: "labels.media.requesting",
  granted: "labels.media.granted",
  denied: "labels.media.denied",
  unsupported: "labels.media.unsupported",
  error: "labels.media.error",
};

export const realtimeLabels: Record<RealtimeConnectionStatus, string> = {
  idle: "labels.realtime.idle",
  "creating-session": "labels.realtime.creating",
  connecting: "labels.realtime.connecting",
  connected: "labels.realtime.connected",
  error: "labels.realtime.error",
};

export const turnDetectionLabels: Record<RealtimeTurnDetectionMode, string> = {
  "server-vad": "labels.turnDetection.serverVad",
  "push-to-talk": "labels.turnDetection.pushToTalk",
};

export const turnDetectionOptions: readonly {
  value: RealtimeTurnDetectionMode;
  label: string;
}[] = [
  { value: "server-vad", label: "labels.turnDetection.serverVad" },
  { value: "push-to-talk", label: "labels.turnDetection.pushToTalk" },
] as const;

export const responseBudgetLabels: Record<RealtimeResponseBudget, string> = {
  brief: "labels.responseBudget.brief",
  standard: "labels.responseBudget.standard",
  detailed: "labels.responseBudget.detailed",
};

export const responseBudgetOptions: readonly {
  value: RealtimeResponseBudget;
  label: string;
}[] = [
  { value: "brief", label: "labels.responseBudget.brief" },
  { value: "standard", label: "labels.responseBudget.standard" },
  { value: "detailed", label: "labels.responseBudget.detailed" },
] as const;

export const visualContextModeLabels: Record<"manual" | "interval", string> = {
  manual: "labels.visualContext.manual",
  interval: "labels.visualContext.interval",
};

export const responseModeLabels: Record<RealtimeResponseMode, string> = {
  "audio-text": "labels.responseMode.audioText",
  "text-only": "labels.responseMode.textOnly",
};

export const providerModeLabels: Record<ProviderMode, string> = {
  chat: "labels.provider.chat",
  realtime: "labels.provider.realtime",
};

export const providerModeOptions: readonly {
  value: ProviderMode;
  label: string;
}[] = [
  { value: "chat", label: "labels.provider.chat" },
  { value: "realtime", label: "labels.provider.realtime" },
] as const;

export type ChatVoiceSendMode = "auto-send" | "review";

export const chatVoiceSendModeOptions: readonly {
  value: ChatVoiceSendMode;
  label: string;
}[] = [
  { value: "auto-send", label: "labels.sendMode.autoSend" },
  { value: "review", label: "labels.sendMode.review" },
] as const;

/** 模型视觉能力分级的徽章文字 key。 */
export const visionCapabilityLabels: Record<VisionCapability, string> = {
  none: "labels.vision.none",
  "single-image": "labels.vision.singleImage",
  "multi-image": "labels.vision.multiImage",
};

/** 模型视觉能力分级的徽章详情 key。 */
export const visionCapabilityDetailLabels: Record<VisionCapability, string> = {
  none: "labels.vision.detailNone",
  "single-image": "labels.vision.detailSingleImage",
  "multi-image": "labels.vision.detailMultiImage",
};

/** 视觉能力徽章的语义等级（决定样式配色）。 */
export type VisionCapabilityBadgeLevel = "warning" | "info" | "success";

/** 视觉能力分级徽章的语义等级映射。 */
export const visionCapabilityBadgeLevels: Record<
  VisionCapability,
  VisionCapabilityBadgeLevel
> = {
  none: "warning",
  "single-image": "info",
  "multi-image": "success",
};
