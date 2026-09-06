import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../src/worker/routes/realtime/types";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type { ChatVoiceSendMode } from "@/modules/assistant/lib/workspace-labels";

/**
 * 工作台控件变更的纯决策层。
 *
 * `assistant-workspace.tsx` 中 10 个设置切换 handler（自动采样、帧剪枝、
 * 轮转检测模式、响应预算、响应模式、麦克风静音、语音发送模式、朗读开关、
 * 文本草稿、采样间隔）此前全部为内联的"事件值 → setState"桥接，不可测。
 * 与 `resolveWorkspaceGating` / `resolveReleaseActions` 同理，把"事件值校验 +
 * 决策"抽为可单测纯函数：每次 UI 变更由组件收集变更请求，交给
 * `resolveWorkspaceControlAction` 一次性算出的动作（判别联合），
 * 副作用（setState / 联动清理）由 `hooks/use-workspace-controls.ts` 接线执行。
 */

/** 一个工作区控件变更请求（从 DOM 事件提取的原始值）。 */
export type WorkspaceControlInput =
  | { kind: "auto-sampling"; checked: boolean }
  | { kind: "frame-pruning"; checked: boolean }
  | { kind: "turn-detection-mode"; value: string }
  | { kind: "response-budget"; value: string }
  | { kind: "response-mode"; checked: boolean }
  | { kind: "microphone-muted"; checked: boolean }
  | { kind: "chat-voice-send-mode"; value: string }
  | { kind: "chat-answer-speech"; checked: boolean }
  | { kind: "text-draft"; value: string }
  | { kind: "sampling-interval"; value: string }
  | { kind: "text-history-summary"; checked: boolean };

/** 由纯函数算出的应执行动作（判别联合，非法输入 → noop）。 */
export type WorkspaceControlAction =
  | { kind: "set-auto-sampling"; enabled: boolean }
  | { kind: "set-frame-pruning"; enabled: boolean }
  | { kind: "set-turn-detection-mode"; mode: RealtimeTurnDetectionMode }
  | { kind: "set-response-budget"; budget: RealtimeResponseBudget }
  | { kind: "set-response-mode"; mode: RealtimeResponseMode }
  | { kind: "set-microphone-muted"; muted: boolean }
  | { kind: "set-chat-voice-send-mode"; mode: ChatVoiceSendMode }
  | { kind: "set-chat-answer-speech"; enabled: boolean }
  | { kind: "set-text-draft"; value: string }
  | { kind: "set-sampling-interval"; seconds: number }
  | { kind: "set-text-history-summary"; enabled: boolean }
  | { kind: "noop" };

const TURN_DETECTION_MODES = new Set<string>(["server-vad", "push-to-talk"]);
const RESPONSE_BUDGETS = new Set<string>(["brief", "standard", "detailed"]);
const CHAT_VOICE_SEND_MODES = new Set<string>(["auto-send", "review"]);

/** 采样间隔允许的范围（秒），超出则忽略。 */
const MIN_SAMPLING_INTERVAL = 1;
const MAX_SAMPLING_INTERVAL = 60;

/**
 * 一次性算出一个工作区控件变更应执行的动作。
 *
 * 输入为扁平的变更请求（kind + 原始值），输出为判别联合动作：
 * 合法的值被解析为对应 `set-*` 动作，非法值 / 越界值 → `noop`（不更新状态）。
 */
export function resolveWorkspaceControlAction(
  input: WorkspaceControlInput,
): WorkspaceControlAction {
  switch (input.kind) {
    case "auto-sampling":
      return { kind: "set-auto-sampling", enabled: input.checked };
    case "frame-pruning":
      return { kind: "set-frame-pruning", enabled: input.checked };
    case "turn-detection-mode":
      if (!TURN_DETECTION_MODES.has(input.value)) {
        return { kind: "noop" };
      }
      return {
        kind: "set-turn-detection-mode",
        mode: input.value as RealtimeTurnDetectionMode,
      };
    case "response-budget":
      if (!RESPONSE_BUDGETS.has(input.value)) {
        return { kind: "noop" };
      }
      return {
        kind: "set-response-budget",
        budget: input.value as RealtimeResponseBudget,
      };
    case "response-mode":
      return {
        kind: "set-response-mode",
        mode: input.checked ? "text-only" : "audio-text",
      };
    case "microphone-muted":
      return { kind: "set-microphone-muted", muted: input.checked };
    case "chat-voice-send-mode":
      if (!CHAT_VOICE_SEND_MODES.has(input.value)) {
        return { kind: "noop" };
      }
      return {
        kind: "set-chat-voice-send-mode",
        mode: input.value as ChatVoiceSendMode,
      };
    case "chat-answer-speech":
      return { kind: "set-chat-answer-speech", enabled: input.checked };
    case "text-draft":
      return { kind: "set-text-draft", value: input.value };
    case "text-history-summary":
      return { kind: "set-text-history-summary", enabled: input.checked };
    case "sampling-interval": {
      const seconds = Number(input.value);

      if (
        !Number.isFinite(seconds) ||
        seconds < MIN_SAMPLING_INTERVAL ||
        seconds > MAX_SAMPLING_INTERVAL
      ) {
        return { kind: "noop" };
      }

      return { kind: "set-sampling-interval", seconds };
    }
  }
}
