import { useCallback, type Dispatch, type MutableRefObject } from "react";

import { type TranscriptEntry, type TranscriptSpeaker } from "@/modules/assistant/types";
import { type AssistantAction } from "@/modules/assistant/state/assistant-reducer";
import { type FrameSignature } from "@/modules/assistant/lib/frame-diff";
import { MAX_FRAME_WIDTH } from "@/modules/assistant/lib/frame-processing";
import {
  addSceneSummary,
  buildSceneSummary,
  estimateSceneMemorySavings,
  serializeSceneMemoryContext,
  type SceneMemoryState,
} from "@/modules/assistant/lib/scene-memory";
import { estimateImageTokens } from "@/modules/assistant/lib/cost-model";
import type { ChatTurnEstimateInput } from "@/modules/assistant/lib/chat-cost-model";
import {
  buildTextHistorySummary,
} from "@/modules/assistant/lib/text-history-summarize";
import {
  parseSpatialAnnotations,
  stripSpatialAnnotations,
  type SpatialAnnotation,
} from "@/modules/assistant/lib/spatial-annotation";
import type { RealtimeResponseBudget } from "../../../../src/worker/routes/realtime/types";

export type ChatTurnInput = {
  userEntryId: string;
  message: string;
  imageDataUrl?: string;
  signature?: FrameSignature;
  awaitSpeech?: boolean;
  forceSpeech?: boolean;
};

type RetryableChatTurn = {
  message: string;
  imageDataUrl?: string;
  signature?: FrameSignature;
};

/**
 * 从发送失败的一轮 Chat 输入中，构造可重试回合（丢弃 awaitSpeech/forceSpeech 等
 * 一次性标志，仅保留重发所需的 message / 可选画面帧）。
 */
export function buildRetryableChatTurn(
  input: ChatTurnInput,
): RetryableChatTurn {
  return {
    message: input.message,
    ...(input.imageDataUrl === undefined
      ? {}
      : { imageDataUrl: input.imageDataUrl }),
    ...(input.signature === undefined
      ? {}
      : { signature: input.signature }),
  };
}

export type UseSendChatTurnOptions = {
  /** 相机会话 reducer 的 dispatch。 */
  dispatch: Dispatch<AssistantAction>;
  /** 追加一条转写条目，返回条目 id。 */
  addTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    deliveryStatus?: TranscriptEntry["deliveryStatus"],
  ) => string;
  /** 会话持久化：写入一条消息。 */
  persistMessage: (message: { role: "user" | "assistant"; content: string }) => void;
  /** M4.1 场景记忆状态 ref（由外部持有，供跨轮复用文字摘要）。 */
  sceneMemoryRef: MutableRefObject<SceneMemoryState>;
  /** M4.1 场景记忆统计（count + 预估 token 节省）。 */
  setSceneMemoryStats: (stats: { count: number; savingsTokens: number }) => void;
  /** M4.1 场景记忆跨会话持久化。 */
  persistSceneMemory: (entries: {
    entryId: string;
    summary: string;
    frameTokens: number;
    recordedAt: number;
  }[]) => void;
  /** M4.3 空间定位标注：解析出的归一化坐标标注。 */
  setSpatialAnnotations: (annotations: readonly SpatialAnnotation[]) => void;
  /** 调用 Chat Completions 的底层能力。 */
  sendChatCompletion: (input: {
    message: string;
    imageDataUrl?: string;
    responseBudget: RealtimeResponseBudget;
    instructions?: string;
    sceneContext?: string;
    historyContext?: string;
  }, options?: { onDelta?: (delta: string) => void }) => Promise<{
    answer: string;
    model?: string;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  } | null>;
  /** 发送一次 Chat 请求时采用的响应预算。 */
  responseBudget: RealtimeResponseBudget;
  /** 记录一帧已上传（更新基线签名 + 计数）。 */
  recordUploadedFrame: (signature: FrameSignature) => void;
  /** 更新某条转写条目的投递状态。 */
  setTranscriptDeliveryStatus: (
    entryId: string,
    status: NonNullable<TranscriptEntry["deliveryStatus"]>,
  ) => void;
  /** 更新可重试的 Chat 回合集合。 */
  setRetryableChatTurns: (updater: (
    current: Readonly<Record<string, RetryableChatTurn>>,
  ) => Readonly<Record<string, RetryableChatTurn>>) => void;
  /** 是否已开启 Chat 回答自动朗读。 */
  isChatAnswerSpeechEnabled: boolean;
  /** 每轮 Chat 完成后回调（用于 live cost measurement 计量）。 */
  onTurnCompleted?: (estimate: ChatTurnEstimateInput) => void;
  /** 本地朗读 Chat 回答。 */
  speakChatAnswer: (text: string) => Promise<boolean>;
  /** 媒体授权状态（决定回复后回到 ready 还是 idle）。 */
  mediaGranted: boolean;
  /** 当前转写区内容（用于构建文本历史摘要）。 */
  transcript: readonly TranscriptEntry[];
  /** 是否开启文本历史摘要（压缩更早轮次注入低成本上下文）。 */
  isTextHistorySummaryEnabled: boolean;
  /** 文本历史摘要统计（压缩条数 + 预估节省 token）。 */
  setTextHistoryStats: (stats: {
    summarizedEntryCount: number;
    savedTextTokens: number;
  }) => void;
};

/**
 * Chat 发送链路 hook。
 *
 * 收敛 `assistant-workspace` 主组件中 ~170 行的 `sendChatTurn` 编排逻辑：
 * 流式输出、会话持久化、场景记忆注入与回写、空间标注解析、回答朗读等，
 * 暴露为单一 `sendChatTurn` 能力，降低主组件体积并保持可测边界。
 */
export function useSendChatTurn({
  dispatch,
  addTranscript,
  persistMessage,
  sceneMemoryRef,
  setSceneMemoryStats,
  persistSceneMemory,
  setSpatialAnnotations,
  sendChatCompletion,
  responseBudget,
  recordUploadedFrame,
  setTranscriptDeliveryStatus,
  setRetryableChatTurns,
  isChatAnswerSpeechEnabled,
  speakChatAnswer,
  mediaGranted,
  transcript,
  isTextHistorySummaryEnabled,
  setTextHistoryStats,
  onTurnCompleted,
}: UseSendChatTurnOptions): {
  sendChatTurn: (input: ChatTurnInput) => Promise<boolean>;
} {
  const sendChatTurn = useCallback(
    async (input: ChatTurnInput): Promise<boolean> => {
      dispatch({ type: "phase-set", phase: "thinking" });

      // 流式输出：先追加空 assistant 条目，再逐增量追加文本。
      const assistantEntryId = addTranscript("assistant", "");
      let streamedAnswer = "";

      // M3.2 会话持久化：把用户消息持久化到当前会话。
      void persistMessage({ role: "user", content: input.message });

      // M4.1 场景记忆：把历史关键帧的文字摘要作为低成本文本上下文注入。
      const sceneContext = serializeSceneMemoryContext(sceneMemoryRef.current);
      const sceneMemoryId =
        input.signature !== undefined
          ? `${input.userEntryId}-${input.signature.width}x${input.signature.height}`
          : input.userEntryId;

      // 文本历史摘要：客户端压缩更早的文本轮次，作为低成本上下文注入（替代重放全部历史）。
      let historyContext: string | undefined;
      if (isTextHistorySummaryEnabled) {
        const historySummary = buildTextHistorySummary(transcript);
        if (historySummary.context.length > 0) {
          historyContext = historySummary.context;
          setTextHistoryStats({
            summarizedEntryCount: historySummary.summarizedEntryCount,
            savedTextTokens: historySummary.savedTextTokens,
          });
        }
      }

      const response = await sendChatCompletion(
        {
          message: input.message,
          imageDataUrl: input.imageDataUrl,
          sceneContext: sceneContext.length > 0 ? sceneContext : undefined,
          historyContext,
          responseBudget,
          instructions:
            "你是一个中文视觉对话助手。请结合用户文字和随附画面，用简洁自然的中文回答。若随附了此前画面（文字摘要），请保持对前序场景的连续理解。" +
            `\n${SPATIAL_ANNOTATION_INSTRUCTION}`,
        },
        {
          onDelta: (delta) => {
            streamedAnswer += delta;
            dispatch({
              type: "transcript-text-append",
              entryId: assistantEntryId,
              text: delta,
            });
          },
        },
      );

      if (response === null) {
        dispatch({ type: "phase-set", phase: "error" });
        setTranscriptDeliveryStatus(input.userEntryId, "failed");
        setRetryableChatTurns((current) => ({
          ...current,
          [input.userEntryId]: buildRetryableChatTurn(input),
        }));
        if (streamedAnswer.length === 0) {
          addTranscript("system", "Chat Completions 请求失败，请检查配置或稍后重试。");
        }
        return false;
      }

      setTranscriptDeliveryStatus(input.userEntryId, "sent");
      setRetryableChatTurns((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([entryId]) => entryId !== input.userEntryId,
          ),
        ),
      );

      if (input.signature !== undefined) {
        recordUploadedFrame(input.signature);
      }

      // M4.1 场景记忆：用本轮用户提问 + 最新帧信息作为一句话场景摘要入库，
      // 使后续轮次可复用它作为低成本文本上下文，替代重复发送历史图片。
      if (input.imageDataUrl !== undefined) {
        const summaryText = `${input.message}（画面：当前视角）`.slice(0, 200);
        sceneMemoryRef.current = addSceneSummary(
          sceneMemoryRef.current,
          buildSceneSummary(
            sceneMemoryId,
            summaryText,
            Date.now(),
            MAX_FRAME_WIDTH,
            Math.round(MAX_FRAME_WIDTH * (9 / 16)),
          ),
        );
        setSceneMemoryStats({
          count: sceneMemoryRef.current.summaries.length,
          savingsTokens: estimateSceneMemorySavings(
            sceneMemoryRef.current,
            estimateImageTokens(
              MAX_FRAME_WIDTH,
              Math.round(MAX_FRAME_WIDTH * (9 / 16)),
            ),
          ),
        });
        // M4.1 场景记忆：把最新窗口持久化到当前会话（跨会话恢复）。
        void persistSceneMemory(
          sceneMemoryRef.current.summaries.map((summary) => ({
            entryId: summary.id,
            summary: summary.text,
            frameTokens: summary.frameTokens,
            recordedAt: summary.recordedAt,
          })),
        );
      }

      const answer = streamedAnswer.length === 0 ? response.answer : streamedAnswer;

      // Live cost measurement：本轮完成后把估算输入委托给计量 hook。
      // 非流式请求若带权威 `usage`，则随输入透传，由计量层优先采用。
      onTurnCompleted?.({
        message: input.message,
        sceneContext: sceneContext.length > 0 ? sceneContext : undefined,
        historyContext,
        imageDataUrl: input.imageDataUrl,
        frameWidth: input.signature?.width,
        frameHeight: input.signature?.height,
        answer: answer.length === 0 ? response.answer : answer,
        usage: response.usage,
      });

      // M4.3 空间定位标注：解析模型回复中的归一化坐标标注，并剥离标注块以展示干净文本。
      const annotations = parseSpatialAnnotations(answer);
      const cleanAnswer =
        annotations.length > 0 ? stripSpatialAnnotations(answer) : answer;
      setSpatialAnnotations(annotations);

      // M3.2 会话持久化：把助手回复（剥离标注块后的干净文本）持久化到当前会话。
      void persistMessage({ role: "assistant", content: cleanAnswer });

      if (streamedAnswer.length === 0) {
        dispatch({
          type: "transcript-text-append",
          entryId: assistantEntryId,
          text: response.answer,
        });
      }

      // 若回复含标注块（流式或一次性），用剥离后的干净文本覆盖展示条目。
      if (annotations.length > 0) {
        dispatch({
          type: "transcript-text-set",
          entryId: assistantEntryId,
          text: cleanAnswer,
        });
      }
      if (input.forceSpeech === true || isChatAnswerSpeechEnabled) {
        const speechResult = speakChatAnswer(cleanAnswer);

        if (input.awaitSpeech === true) {
          await speechResult;
        } else {
          void speechResult;
        }
      }
      dispatch({
        type: "phase-set",
        phase: mediaGranted ? "ready" : "idle",
      });
      return true;
    },
    [
      addTranscript,
      dispatch,
      isChatAnswerSpeechEnabled,
      mediaGranted,
      persistMessage,
      persistSceneMemory,
      recordUploadedFrame,
      responseBudget,
      sceneMemoryRef,
      sendChatCompletion,
      setRetryableChatTurns,
      setSceneMemoryStats,
      setSpatialAnnotations,
      setTranscriptDeliveryStatus,
      speakChatAnswer,
      transcript,
      isTextHistorySummaryEnabled,
      setTextHistoryStats,
      onTurnCompleted,
    ],
  );

  return { sendChatTurn };
}

/**
 * M4.3 空间定位标注：引导模型在用户询问对象位置时输出结构化标注块。
 *
 * 模型以文本方式返回 `[ANNOTATIONS] JSON数组 [/ANNOTATIONS]` 分块，
 * 前端解析后在摄像头预览叠加归一化坐标框。未询问位置时模型应不输出，
 * 减少 token 开销。
 */
const SPATIAL_ANNOTATION_INSTRUCTION =
  "当用户询问画面中某个对象在哪里（如“在哪/位置/哪个方向”）时，" +
  "在回答末尾额外输出一个标注块：[ANNOTATIONS][{\"label\":\"对象名\",\"box\":{\"x\":0.5,\"y\":0.4,\"w\":0.3,\"h\":0.2}}][/ANNOTATIONS]，" +
  "其中 x/y/w/h 均为 0~1 归一化坐标（x 向右、y 向下）。不在上述场景时不要输出标注块。";
