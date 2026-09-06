import { describe, expect, it } from "vitest";

import {
  renderLocalizedText,
  resolveCostControlItems,
  resolveWorkspaceStatusLabels,
  type WorkspaceStatusContext,
} from "@/modules/assistant/lib/workspace-status-labels";

const baseContext: WorkspaceStatusContext = {
  hasMedia: true,
  isChatMode: true,
  isContinuousChatVoiceEnabled: false,
  isChatVoiceRecording: false,
  isChatVoiceTranscribing: false,
  isChatSending: false,
  isSpeaking: false,
  transcriptionIsRecordingSupported: true,
  transcriptionStatus: "idle",
  transcriptionErrorMessage: null,
  chatVoiceSendMode: "auto-send",
  isMicrophoneMuted: false,
  isPushToTalkMode: true,
  isPushToTalkActive: false,
  hasRealtimeConnection: false,
  peerConnectionState: null,
  realtimeStatus: "idle",
};

/** 简体中文的扁平 key → 文案字典，供 renderLocalizedText 断言。 */
const zhTexts: Record<string, string> = {
  "status.micWaiting": "等待授权",
  "status.chatListening": "连续聆听",
  "status.transcribing": "正在转写",
  "status.waitingReply": "等待回答",
  "status.speaking": "正在朗读",
  "status.continuousStandby": "连续待命",
  "status.recording": "正在录音",
  "status.canVoiceAsk": "可语音提问",
  "status.noRecording": "不支持录音",
  "status.micMuted": "麦克风已静音",
  "status.speakingNow": "正在说话",
  "status.pushToTalk": "按住说话",
  "status.micOn": "麦克风已开启",
  "status.chatSpeechUnsupported": "当前浏览器不支持本地录音，请改用键盘输入。",
  "status.chatSpeechNeedAccess": "请先授权摄像头和麦克风，再使用语音提问。",
  "status.continuousListening": "连续对话正在听你说话，说完会自动转写。",
  "status.continuousTranscribing": "连续对话正在通过 Worker 转写语音。",
  "status.continuousWaiting": "连续对话正在等待模型回答。",
  "status.continuousSpeaking": "正在朗读回答，结束后会继续听你说话。",
  "status.continuousOn": "连续语音对话已开启。",
  "status.recordingStop": "正在录音，说完后点击停止并转写。",
  "status.workerTranscribing": "正在通过 Worker 转写语音。",
  "status.speechError": "语音转写异常。",
  "status.autoSendVoice": "录音会先转文字，再自动发送到 Chat。",
  "status.reviewVoice": "录音会先转文字，并填入输入框供你确认。",
  "status.providerContinuousOn": "连续语音对话已开启",
  "status.providerTranscribing": "正在通过 Worker 转写语音",
  "status.providerSending": "正在通过 HTTP 请求 Chat Completions",
  "status.providerChat": "使用 Chat Completions：无需 Realtime/WebRTC 会话",
  "status.providerRealtimeConnected": "Realtime 连接已建立",
  "status.providerWaitingCreate": "等待 Worker 创建会话",
  "status.providerConnecting": "连接状态：{{state}}",
  "status.connecting": "连接中",
  "status.directAsk": "直接提问",
  "status.startSession": "启动会话",
  "status.realtimeOnly": "Realtime 专用",
  "status.releaseSubmit": "松开提交",
  "status.pttRealtimeHint": "按住说话只用于 Realtime 模式；Chat 模式请使用右侧语音输入或键盘输入。",
  "status.pttHoldHint": "按住时发送麦克风音频，松开后提交给 Realtime 模型。",
  "status.costProviderLabel": "提供方式",
  "status.costProviderChatDetail": "通过 HTTP 调用 /v1/chat/completions，兼容常见 API 网关",
  "status.costProviderRealtimeDetail": "WebRTC Realtime 直连，适合低延迟语音互动",
  "status.costVisionLabel": "视觉上下文",
  "status.costVisionChatValue": "按需截帧",
  "status.costVisionIntervalDetail": "只发送抽样 JPEG，不连续上传原始视频",
  "status.costSessionLabel": "会话时长",
  "status.costSessionChatValue": "按请求结束",
  "status.costSessionMinutes": "{{count}} 分钟",
  "status.costSessionDetail": "限制单次 Realtime 会话，避免空转成本",
  "status.costSessionChatDetail": "Chat Completions 不保持 WebRTC 长连接",
  "status.costIdleLabel": "空闲断开",
  "status.costIdleSeconds": "{{count}} 秒",
  "status.costIdleDetail": "{{count}} 秒后提示，长时间无操作会自动断开",
  "status.costBudgetLabel": "回答预算",
  "status.costBudgetDetail": "Worker 为模型输出设置最大 token 数",
  "status.costModeLabel": "输出模式",
  "status.costModeChatText": "文本",
  "status.costModeTextOnlyDetail": "仅请求文本输出，减少音频 token",
  "status.costKeyLabel": "密钥位置",
  "status.costKeyValue": "服务器端",
  "status.costKeyDetail": "永久密钥只保存在 Worker 环境变量中",
  "status.costTurnLabel": "轮次触发",
  "status.costTurnWorker": "Worker 转写",
  "status.costTurnChatDetail": "浏览器录制短音频，Worker 转成文字后再发送 Chat 请求",
  "status.costMicLabel": "麦克风",
  "status.costMicChatDetail": "仅在语音提问时上传一段短录音用于转写",
  "status.costMicMutedDetail": "当前不会发送麦克风音频",
  "status.costMicRealtimeDetail": "音频通过 Realtime 会话发送",
  "status.costFrameLabel": "帧差阈值",
  "status.costFrameDetail": "自动采样会跳过变化很小的画面",
  "labels.provider.chat": "兼容模式",
  "labels.provider.realtime": "Realtime",
  "labels.responseMode.audioText": "语音+文本",
  "labels.responseMode.textOnly": "仅文本",
  "labels.responseBudget.brief": "简短",
  "labels.responseBudget.standard": "标准",
  "labels.responseBudget.detailed": "详细",
  "labels.turnDetection.serverVad": "服务端 VAD",
  "labels.turnDetection.pushToTalk": "按住说话",
  "labels.visualContext.manual": "手动发送",
  "labels.visualContext.interval": "自动采样",
};

const zhTranslate = (
  key: string,
  options?: Record<string, string | number>,
): string => {
  let text = zhTexts[key] ?? key;
  if (options) {
    for (const [name, value] of Object.entries(options)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return text;
};

/** 断言标签决策解析出的可渲染文本等于期望文案。 */
const expectText = (
  ctx: WorkspaceStatusContext,
  field: "microphoneStatus" | "chatSpeechStatus" | "providerDetail" | "startSessionLabel" | "pushToTalkLabel" | "pushToTalkTitle",
  expected: string,
): void => {
  const labels = resolveWorkspaceStatusLabels(ctx);
  expect(renderLocalizedText(zhTranslate, labels[field])).toBe(expected);
};

describe("resolveWorkspaceStatusLabels — microphoneStatus", () => {
  it("无媒体时显示等待授权", () => {
    expectText(
      { ...baseContext, hasMedia: false },
      "microphoneStatus",
      "等待授权",
    );
  });

  it("Chat 连续语音开启：录音→连续聆听，其余子状态正确", () => {
    const continuous = { ...baseContext, isContinuousChatVoiceEnabled: true };

    expectText({ ...continuous, isChatVoiceRecording: true }, "microphoneStatus", "连续聆听");
    expectText({ ...continuous, isChatVoiceTranscribing: true }, "microphoneStatus", "正在转写");
    expectText({ ...continuous, isChatSending: true }, "microphoneStatus", "等待回答");
    expectText({ ...continuous, isSpeaking: true }, "microphoneStatus", "正在朗读");
    expectText(continuous, "microphoneStatus", "连续待命");
  });

  it("Chat 非连续：录音/转写/可语音提问/不支持录音依次判定", () => {
    expectText({ ...baseContext, isChatVoiceRecording: true }, "microphoneStatus", "正在录音");
    expectText({ ...baseContext, isChatVoiceTranscribing: true }, "microphoneStatus", "正在转写");
    expectText({ ...baseContext, transcriptionIsRecordingSupported: false }, "microphoneStatus", "不支持录音");
    expectText(baseContext, "microphoneStatus", "可语音提问");
  });

  it("Realtime：静音→已静音，PTT 说话→正在说话，PTT 空闲→按住说话，否则开启", () => {
    const realtime = { ...baseContext, isChatMode: false };

    expectText({ ...realtime, isMicrophoneMuted: true }, "microphoneStatus", "麦克风已静音");
    expectText(
      { ...realtime, isPushToTalkMode: true, isPushToTalkActive: true },
      "microphoneStatus",
      "正在说话",
    );
    expectText(
      { ...realtime, isPushToTalkMode: true, isPushToTalkActive: false },
      "microphoneStatus",
      "按住说话",
    );
    expectText({ ...realtime, isPushToTalkMode: false }, "microphoneStatus", "麦克风已开启");
  });
});

describe("resolveWorkspaceStatusLabels — chatSpeechStatus", () => {
  it("不支持录音或未授权媒体时提示前置条件", () => {
    expectText(
      { ...baseContext, transcriptionIsRecordingSupported: false },
      "chatSpeechStatus",
      "当前浏览器不支持本地录音，请改用键盘输入。",
    );
    expectText(
      { ...baseContext, hasMedia: false },
      "chatSpeechStatus",
      "请先授权摄像头和麦克风，再使用语音提问。",
    );
  });

  it("连续语音开启时映射到连续对话状态文案", () => {
    const continuous = { ...baseContext, isContinuousChatVoiceEnabled: true };

    expectText({ ...continuous, isChatVoiceRecording: true }, "chatSpeechStatus", "连续对话正在听你说话，说完会自动转写。");
    expectText({ ...continuous, isChatVoiceTranscribing: true }, "chatSpeechStatus", "连续对话正在通过 Worker 转写语音。");
    expectText({ ...continuous, isChatSending: true }, "chatSpeechStatus", "连续对话正在等待模型回答。");
    expectText({ ...continuous, isSpeaking: true }, "chatSpeechStatus", "正在朗读回答，结束后会继续听你说话。");
    expectText(continuous, "chatSpeechStatus", "连续语音对话已开启。");
  });

  it("非连续：录音/转写/错误/发送模式文案", () => {
    expectText({ ...baseContext, isChatVoiceRecording: true }, "chatSpeechStatus", "正在录音，说完后点击停止并转写。");
    expectText({ ...baseContext, isChatVoiceTranscribing: true }, "chatSpeechStatus", "正在通过 Worker 转写语音。");
    expectText(
      { ...baseContext, transcriptionStatus: "error", transcriptionErrorMessage: null },
      "chatSpeechStatus",
      "语音转写异常。",
    );
    expectText(
      { ...baseContext, transcriptionStatus: "error", transcriptionErrorMessage: "上游超时" },
      "chatSpeechStatus",
      "上游超时",
    );
    expectText({ ...baseContext, chatVoiceSendMode: "auto-send" }, "chatSpeechStatus", "录音会先转文字，再自动发送到 Chat。");
    expectText({ ...baseContext, chatVoiceSendMode: "review" }, "chatSpeechStatus", "录音会先转文字，并填入输入框供你确认。");
  });
});

describe("resolveWorkspaceStatusLabels — providerDetail", () => {
  it("Chat 模式按连续语音/转写/发送/默认分派", () => {
    const chat = { ...baseContext, isContinuousChatVoiceEnabled: true };

    expectText({ ...chat, isChatVoiceRecording: true }, "providerDetail", "连续语音对话已开启");
    expectText({ ...baseContext, isChatVoiceTranscribing: true }, "providerDetail", "正在通过 Worker 转写语音");
    expectText({ ...baseContext, isChatSending: true }, "providerDetail", "正在通过 HTTP 请求 Chat Completions");
    expectText(baseContext, "providerDetail", "使用 Chat Completions：无需 Realtime/WebRTC 会话");
  });

  it("Realtime 模式：已连接/等待创建/连接中（含插值）", () => {
    const realtime = { ...baseContext, isChatMode: false };

    expectText({ ...realtime, hasRealtimeConnection: true }, "providerDetail", "Realtime 连接已建立");
    expectText({ ...realtime, peerConnectionState: null }, "providerDetail", "等待 Worker 创建会话");
    expectText(
      { ...realtime, peerConnectionState: "connected" },
      "providerDetail",
      "连接状态：connected",
    );
  });
});

describe("resolveWorkspaceStatusLabels — startSessionLabel", () => {
  it("连接中显示连接中，Chat 显示直接提问，Realtime 显示启动会话", () => {
    expectText(
      { ...baseContext, realtimeStatus: "connecting" },
      "startSessionLabel",
      "连接中",
    );
    expectText(
      { ...baseContext, realtimeStatus: "creating-session" },
      "startSessionLabel",
      "连接中",
    );
    expectText(baseContext, "startSessionLabel", "直接提问");
    expectText(
      { ...baseContext, isChatMode: false, realtimeStatus: "idle" },
      "startSessionLabel",
      "启动会话",
    );
  });
});

describe("resolveWorkspaceStatusLabels — pushToTalkLabel / pushToTalkTitle", () => {
  it("Chat 模式显示 Realtime 专用与提示，Realtime 按 PTT 激活状态切换", () => {
    expectText(baseContext, "pushToTalkLabel", "Realtime 专用");
    expectText(
      baseContext,
      "pushToTalkTitle",
      "按住说话只用于 Realtime 模式；Chat 模式请使用右侧语音输入或键盘输入。",
    );

    const realtime = { ...baseContext, isChatMode: false };
    expectText(realtime, "pushToTalkLabel", "按住说话");
    expectText({ ...realtime, isPushToTalkActive: true }, "pushToTalkLabel", "松开提交");
    expectText(realtime, "pushToTalkTitle", "按住时发送麦克风音频，松开后提交给 Realtime 模型。");
  });
});

describe("resolveCostControlItems — 成本面板派生标签", () => {
  const costBase = {
    providerMode: "chat" as const,
    isChatMode: true,
    isAutoSampling: false,
    costPolicy: null,
    activeResponseBudget: "standard" as const,
    responseMode: "audio-text" as const,
    isContinuousChatVoiceEnabled: false,
    isChatAnswerSpeechEnabled: false,
    transcriptionIsRecordingSupported: true,
    activeTurnDetectionMode: "server-vad" as const,
    microphoneStatus: { key: "status.micOn" } as const,
    isMicrophoneMuted: false,
  };

  it("Chat 模式：提供方式/视觉/会话/输出/密钥/轮次/麦克风/帧差标签正确", () => {
    const items = resolveCostControlItems(costBase);
    expect(items.length).toBe(10);

    expect(renderLocalizedText(zhTranslate, items[0].label)).toBe("提供方式");
    expect(renderLocalizedText(zhTranslate, items[0].value)).toBe("兼容模式");
    expect(renderLocalizedText(zhTranslate, items[0].detail)).toBe(
      "通过 HTTP 调用 /v1/chat/completions，兼容常见 API 网关",
    );

    expect(renderLocalizedText(zhTranslate, items[1].value)).toBe("按需截帧");
    expect(renderLocalizedText(zhTranslate, items[2].value)).toBe("按请求结束");
    expect(renderLocalizedText(zhTranslate, items[3].value)).toBe("120 秒");
    expect(renderLocalizedText(zhTranslate, items[4].value)).toBe("标准");
    expect(renderLocalizedText(zhTranslate, items[5].value)).toBe("文本");
    expect(renderLocalizedText(zhTranslate, items[6].label)).toBe("密钥位置");
    expect(renderLocalizedText(zhTranslate, items[7].value)).toBe("Worker 转写");
    expect(renderLocalizedText(zhTranslate, items[8].value)).toBe("麦克风已开启");
    expect(renderLocalizedText(zhTranslate, items[9].value)).toBe("4%");
  });

  it("Realtime 模式：视觉/会话时长插值/预算拼接标签正确", () => {
    const items = resolveCostControlItems({
      ...costBase,
      isChatMode: false,
      providerMode: "realtime",
      isAutoSampling: true,
      costPolicy: {
        visualContextMode: "interval",
        maxSessionSeconds: 300,
        maxResponseOutputTokens: 2048,
      },
      activeResponseBudget: "detailed",
      responseMode: "text-only",
      activeTurnDetectionMode: "push-to-talk",
    });

    expect(renderLocalizedText(zhTranslate, items[1].value)).toBe("自动采样");
    expect(renderLocalizedText(zhTranslate, items[2].value)).toBe("5 分钟");
    expect(renderLocalizedText(zhTranslate, items[4].value)).toBe("详细 / 2.0k");
    expect(renderLocalizedText(zhTranslate, items[5].value)).toBe("仅文本");
    expect(renderLocalizedText(zhTranslate, items[7].value)).toBe("按住说话");
  });

  it("无 costPolicy 时 Realtime 会话时长回退默认值、预算不拼接", () => {
    const items = resolveCostControlItems({
      ...costBase,
      isChatMode: false,
      providerMode: "realtime",
      costPolicy: null,
      activeResponseBudget: "standard",
    });

    expect(renderLocalizedText(zhTranslate, items[2].value)).toBe("10 分钟");
    expect(renderLocalizedText(zhTranslate, items[4].value)).toBe("标准");
  });

  it("麦克风状态标签直接复用传入的 LocalizedText（无重复决策）", () => {
    const items = resolveCostControlItems({
      ...costBase,
      isChatMode: false,
      providerMode: "realtime",
      microphoneStatus: { key: "status.micMuted" },
      isMicrophoneMuted: true,
    });
    expect(renderLocalizedText(zhTranslate, items[8].value)).toBe("麦克风已静音");
    expect(renderLocalizedText(zhTranslate, items[8].detail)).toBe(
      "当前不会发送麦克风音频",
    );
  });
});
