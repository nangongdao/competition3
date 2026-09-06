import type {
  AssistantPhase,
  TranscriptEntry,
} from "@/modules/assistant/types";

/**
 * 助手工作区强相关状态，集中收敛为 reducer 管理。
 *
 * 这些状态原本以 4+ 个 useState 分散在顶层，任一变化都会重渲染整棵子树。
 * reducer 是纯函数，可以直接单测，也把"自动采样一次 setState 3 次"收敛为
 * 一次 dispatch。
 */
export type AssistantFrameStats = {
  sampled: number;
  sent: number;
  skippedAuto: number;
};

export type AssistantState = {
  phase: AssistantPhase;
  transcript: readonly TranscriptEntry[];
  frameStats: AssistantFrameStats;
  lastFrameDataUrl: string | null;
};

export type AssistantAction =
  | { type: "phase-set"; phase: AssistantPhase }
  | { type: "transcript-appended"; entry: TranscriptEntry }
  | {
      type: "transcript-text-append";
      entryId: string;
      text: string;
    }
  | {
      type: "transcript-text-set";
      entryId: string;
      text: string;
    }
  | {
      type: "transcript-delivery-set";
      entryId: string;
      deliveryStatus: NonNullable<TranscriptEntry["deliveryStatus"]>;
    }
  | { type: "transcript-cleared" }
  | {
      type: "frame-sampled";
      dataUrl: string;
    }
  | { type: "frame-sent" }
  | { type: "frame-skipped" }
  | { type: "frame-upload-counters-reset" }
  | { type: "last-frame-cleared" };

export const initialFrameStats: AssistantFrameStats = {
  sampled: 0,
  sent: 0,
  skippedAuto: 0,
};

export function createInitialAssistantState(
  transcript: readonly TranscriptEntry[],
): AssistantState {
  return {
    phase: "idle",
    transcript,
    frameStats: initialFrameStats,
    lastFrameDataUrl: null,
  };
}

export function assistantReducer(
  state: AssistantState,
  action: AssistantAction,
): AssistantState {
  switch (action.type) {
    case "phase-set":
      if (state.phase === action.phase) {
        return state;
      }
      return { ...state, phase: action.phase };

    case "transcript-appended":
      return {
        ...state,
        transcript: [...state.transcript, action.entry],
      };

    case "transcript-text-append":
      return {
        ...state,
        transcript: state.transcript.map((entry) =>
          entry.id === action.entryId
            ? { ...entry, text: entry.text + action.text }
            : entry,
        ),
      };

    case "transcript-text-set":
      return {
        ...state,
        transcript: state.transcript.map((entry) =>
          entry.id === action.entryId ? { ...entry, text: action.text } : entry,
        ),
      };

    case "transcript-delivery-set":
      return {
        ...state,
        transcript: state.transcript.map((entry) =>
          entry.id === action.entryId
            ? { ...entry, deliveryStatus: action.deliveryStatus }
            : entry,
        ),
      };

    case "transcript-cleared":
      return { ...state, transcript: [] };

    case "frame-sampled":
      return {
        ...state,
        lastFrameDataUrl: action.dataUrl,
        frameStats: {
          ...state.frameStats,
          sampled: state.frameStats.sampled + 1,
        },
      };

    case "frame-sent":
      return {
        ...state,
        frameStats: {
          ...state.frameStats,
          sent: state.frameStats.sent + 1,
        },
      };

    case "frame-skipped":
      return {
        ...state,
        frameStats: {
          ...state.frameStats,
          skippedAuto: state.frameStats.skippedAuto + 1,
        },
      };

    case "frame-upload-counters-reset":
      return {
        ...state,
        frameStats: {
          ...state.frameStats,
          sent: 0,
          skippedAuto: 0,
        },
      };

    case "last-frame-cleared":
      if (state.lastFrameDataUrl === null) {
        return state;
      }
      return { ...state, lastFrameDataUrl: null };
  }
}
