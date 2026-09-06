import { memo } from "react";
import {
  CircleStop,
  Gauge,
  Mic,
  MicOff,
  Radio,
  Volume2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  chatVoiceSendModeOptions,
  providerModeOptions,
  responseBudgetOptions,
  turnDetectionOptions,
  type ChatVoiceSendMode,
} from "@/modules/assistant/lib/workspace-labels";
import type { CostControlSetting } from "@/modules/assistant/types";
import type { RealtimeResponseMode } from "@/modules/assistant/lib/realtime-protocol";
import type { ProviderMode } from "../../../../../src/worker/routes/provider/types";
import type {
  RealtimeResponseBudget,
  RealtimeTurnDetectionMode,
} from "../../../../../src/worker/routes/realtime/types";

type CostControlPanelProps = {
  isVisible: boolean;
  costControls: readonly CostControlSetting[];
  providerMode: ProviderMode;
  isChatMode: boolean;
  canChangeProviderMode: boolean;
  onProviderModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isContinuousChatVoiceEnabled: boolean;
  canStartContinuousChatVoice: boolean;
  onContinuousChatVoiceClick: () => void;
  isChatVoiceRecording: boolean;
  canToggleChatSpeechInput: boolean;
  onChatSpeechInputClick: () => void;
  isChatVoiceBusy: boolean;
  isChatSending: boolean;
  chatVoiceSendMode: ChatVoiceSendMode;
  onChatVoiceSendModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  chatSpeechStatusLabel: string;
  canChangeTurnMode: boolean;
  turnDetectionMode: RealtimeTurnDetectionMode;
  onTurnDetectionModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isMicrophoneMuted: boolean;
  hasMedia: boolean;
  onMicrophoneMutedChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  canChangeResponseBudget: boolean;
  responseBudget: RealtimeResponseBudget;
  onResponseBudgetChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isChatAnswerSpeechEnabled: boolean;
  isSpeechSynthesisSupported: boolean;
  onChatAnswerSpeechChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isSpeechSpeaking: boolean;
  onCancelChatSpeech: () => void;
  responseMode: RealtimeResponseMode;
  onResponseModeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isAutoSampling: boolean;
  onAutoSamplingChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  samplingIntervalSeconds: number;
  onSamplingIntervalChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isFramePruningEnabled: boolean;
  onFramePruningChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isTextHistorySummaryEnabled: boolean;
  onTextHistorySummaryChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

const fieldsetClassName =
  "group m-0 grid min-w-0 gap-2 border-0 p-0";
const legendClassName =
  "m-0 text-[0.78rem] font-[600] uppercase text-fog";
const optionRowClassName =
  "grid grid-cols-2 gap-2 max-[480px]:grid-cols-1";
const optionLabelClassName = "relative min-w-0";
const optionInputClassName = "peer pointer-events-none absolute opacity-0";
const optionSpanClassName =
  "flex min-h-[38px] cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-center text-[0.86rem] font-[600] text-foreground transition-[background,border-color,color] duration-[200ms] peer-checked:border-[color:var(--color-primary)] peer-checked:bg-[color:var(--color-primary)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet group-disabled:cursor-not-allowed group-disabled:opacity-50";
const inlineActionClassName =
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[0.86rem] font-[600] text-foreground transition-[background,border-color] duration-[200ms] enabled:hover:border-white/20 enabled:hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet disabled:cursor-not-allowed disabled:opacity-50";
const toggleRowClassName =
  "grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2.5 text-[0.9rem] font-[600] text-foreground";
const toggleInputClassName = "h-[18px] w-[18px] accent-primary";
const rangeRowClassName =
  "grid grid-cols-[58px_minmax(0,1fr)_42px] items-center gap-2.5 text-[0.9rem] font-[600] text-foreground";
const rangeInputClassName = "w-full accent-violet";

export const CostControlPanel = memo(function CostControlPanel({
  isVisible,
  costControls,
  providerMode,
  isChatMode,
  canChangeProviderMode,
  onProviderModeChange,
  isContinuousChatVoiceEnabled,
  canStartContinuousChatVoice,
  onContinuousChatVoiceClick,
  isChatVoiceRecording,
  canToggleChatSpeechInput,
  onChatSpeechInputClick,
  isChatVoiceBusy,
  isChatSending,
  chatVoiceSendMode,
  onChatVoiceSendModeChange,
  chatSpeechStatusLabel,
  canChangeTurnMode,
  turnDetectionMode,
  onTurnDetectionModeChange,
  isMicrophoneMuted,
  hasMedia,
  onMicrophoneMutedChange,
  canChangeResponseBudget,
  responseBudget,
  onResponseBudgetChange,
  isChatAnswerSpeechEnabled,
  isSpeechSynthesisSupported,
  onChatAnswerSpeechChange,
  isSpeechSpeaking,
  onCancelChatSpeech,
  responseMode,
  onResponseModeChange,
  isAutoSampling,
  onAutoSamplingChange,
  samplingIntervalSeconds,
  onSamplingIntervalChange,
  isFramePruningEnabled,
  onFramePruningChange,
  isTextHistorySummaryEnabled,
  onTextHistorySummaryChange,
}: CostControlPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className="cost-panel max-[480px]:px-3.5 max-[480px]:py-3 max-[1024px]:grid-cols-2"
      aria-label={t("costControl.panel")}
      hidden={!isVisible}
    >
      <div className="panel-heading max-[1024px]:col-span-full">
        <Gauge size={18} aria-hidden="true" />
        <span className="text-foreground">{t("costControl.title")}</span>
      </div>
      <dl tabIndex={0} className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        {costControls.map((item) => (
          <div key={item.label} className="grid grid-cols-[76px_minmax(0,1fr)] items-baseline gap-2 max-[480px]:grid-cols-1">
            <dt className="m-0 text-[0.78rem] font-[600] uppercase tracking-normal text-fog">
              {item.label}
            </dt>
            <dd className="m-0 grid min-w-0 gap-0.5">
              <strong className="text-[1rem] text-foreground">{item.value}</strong>
              <span className="text-[0.76rem] leading-[1.25] text-fog">{item.detail}</span>
            </dd>
          </div>
        ))}
      </dl>

      <div className="provider-controls max-[1024px]:col-auto max-[1024px]:row-auto" aria-label={t("costControl.providerMode")}>
        <fieldset className={fieldsetClassName} disabled={!canChangeProviderMode}>
          <legend className={legendClassName}>{t("costControl.provider")}</legend>
          <div className={optionRowClassName}>
            {providerModeOptions.map((option) => (
              <label key={option.value} className={optionLabelClassName}>
                <input
                  type="radio"
                  name="provider-mode"
                  value={option.value}
                  checked={providerMode === option.value}
                  onChange={onProviderModeChange}
                  className={optionInputClassName}
                />
                <span className={optionSpanClassName}>{t(option.label)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="voice-controls max-[1024px]:col-auto max-[1024px]:row-auto" aria-label={t("costControl.voiceSettings")}>
        {isChatMode ? (
          <div className="chat-speech-controls" aria-label={t("costControl.chatVoiceInput")}>
            <button
              className={`${inlineActionClassName} aria-pressed:bg-background aria-pressed:text-foreground`}
              type="button"
              onClick={onContinuousChatVoiceClick}
              disabled={
                !isContinuousChatVoiceEnabled && !canStartContinuousChatVoice
              }
              aria-pressed={isContinuousChatVoiceEnabled}
            >
              {isContinuousChatVoiceEnabled ? (
                <CircleStop size={16} aria-hidden="true" />
              ) : (
                <Radio size={16} aria-hidden="true" />
              )}
              <span>
                {isContinuousChatVoiceEnabled ? t("costControl.stopContinuous") : t("costControl.continuousChat")}
              </span>
            </button>
            <button
              className={inlineActionClassName}
              type="button"
              onClick={onChatSpeechInputClick}
              disabled={!canToggleChatSpeechInput}
              aria-pressed={isChatVoiceRecording}
            >
              {isChatVoiceRecording ? (
                <MicOff size={16} aria-hidden="true" />
              ) : (
                <Mic size={16} aria-hidden="true" />
              )}
              <span>{isChatVoiceRecording ? t("costControl.stopTranscribe") : t("costControl.singleVoice")}</span>
            </button>
            <fieldset
              className={fieldsetClassName}
              disabled={isChatVoiceBusy || isChatSending}
            >
              <legend className={legendClassName}>{t("costControl.sendMode")}</legend>
              <div className={optionRowClassName}>
                {chatVoiceSendModeOptions.map((option) => (
                  <label key={option.value} className={optionLabelClassName}>
                    <input
                      type="radio"
                      name="chat-voice-send-mode"
                      value={option.value}
                      checked={chatVoiceSendMode === option.value}
                      onChange={onChatVoiceSendModeChange}
                      className={optionInputClassName}
                    />
                    <span className={optionSpanClassName}>{t(option.label)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <span className="col-span-full text-[0.82rem] leading-[1.35] text-fog">
              {chatSpeechStatusLabel}
            </span>
          </div>
        ) : (
          <>
            <fieldset className={fieldsetClassName} disabled={!canChangeTurnMode}>
              <legend className={legendClassName}>{t("costControl.turnMode")}</legend>
              <div className={optionRowClassName}>
                {turnDetectionOptions.map((option) => (
                  <label key={option.value} className={optionLabelClassName}>
                    <input
                      type="radio"
                      name="turn-detection-mode"
                      value={option.value}
                      checked={turnDetectionMode === option.value}
                      onChange={onTurnDetectionModeChange}
                      className={optionInputClassName}
                    />
                    <span className={optionSpanClassName}>{t(option.label)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={toggleRowClassName}>
              <input
                type="checkbox"
                checked={isMicrophoneMuted}
                onChange={onMicrophoneMutedChange}
                disabled={!hasMedia}
                className={toggleInputClassName}
              />
              <span>{isMicrophoneMuted ? t("costControl.unmuteMicrophone") : t("costControl.muteMicrophone")}</span>
            </label>
          </>
        )}
      </div>

      <div className="response-controls max-[1024px]:col-auto max-[1024px]:row-auto" aria-label={t("costControl.responseSettings")}>
        <fieldset className={fieldsetClassName} disabled={!canChangeResponseBudget}>
          <legend className={legendClassName}>{t("costControl.responseLength")}</legend>
          <div className={`${optionRowClassName} grid-cols-3 max-[480px]:grid-cols-1`}>
            {responseBudgetOptions.map((option) => (
              <label key={option.value} className={optionLabelClassName}>
                <input
                  type="radio"
                  name="response-budget"
                  value={option.value}
                  checked={responseBudget === option.value}
                  onChange={onResponseBudgetChange}
                  className={optionInputClassName}
                />
                <span className={optionSpanClassName}>{t(option.label)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {isChatMode ? (
          <>
            <label className={toggleRowClassName}>
              <input
                type="checkbox"
                checked={isChatAnswerSpeechEnabled}
                onChange={onChatAnswerSpeechChange}
                disabled={!isSpeechSynthesisSupported}
                className={toggleInputClassName}
              />
              <span>
                {isChatAnswerSpeechEnabled ? t("costControl.chatAutoSpeak") : t("costControl.chatNoSpeak")}
              </span>
            </label>

            {!isSpeechSynthesisSupported ? (
              <p
                className="m-0 text-[0.78rem] leading-[1.4] text-fog"
                role="note"
                aria-label="speechSynthesisUnsupported"
              >
                {t("costControl.speechSynthesisUnsupported")}
              </p>
            ) : null}

            <button
              className={inlineActionClassName}
              type="button"
              onClick={onCancelChatSpeech}
              disabled={!isSpeechSpeaking}
            >
              <Volume2 size={16} aria-hidden="true" />
              <span>{t("costControl.stopSpeaking")}</span>
            </button>

            <label className={toggleRowClassName}>
              <input
                type="checkbox"
                checked={isTextHistorySummaryEnabled}
                onChange={onTextHistorySummaryChange}
                className={toggleInputClassName}
              />
              <span>{t("costControl.textHistorySummary")}</span>
            </label>
          </>
        ) : (
          <label className={toggleRowClassName}>
            <input
              type="checkbox"
              checked={responseMode === "text-only"}
              onChange={onResponseModeChange}
              className={toggleInputClassName}
            />
            <span>
              {responseMode === "text-only" ? t("costControl.textOnlyReply") : t("costControl.voiceAndTextReply")}
            </span>
          </label>
        )}
      </div>

      <div className="sampling-controls max-[1024px]:col-auto max-[1024px]:row-auto" aria-label={t("costControl.visualSampling")}>
        <label className={toggleRowClassName}>
          <input
            type="checkbox"
            checked={isAutoSampling}
            onChange={onAutoSamplingChange}
            disabled={!hasMedia}
            className={toggleInputClassName}
          />
          <span>{t("costControl.autoVisualSampling")}</span>
        </label>

        <label className={rangeRowClassName}>
          <span>{t("costControl.interval")}</span>
          <input
            type="range"
            min="5"
            max="20"
            step="1"
            value={samplingIntervalSeconds}
            onChange={onSamplingIntervalChange}
            disabled={!hasMedia || !isAutoSampling}
            className={rangeInputClassName}
          />
          <strong>{t("costControl.seconds", { count: samplingIntervalSeconds })}</strong>
        </label>

        <label className={toggleRowClassName}>
          <input
            type="checkbox"
            checked={isFramePruningEnabled}
            onChange={onFramePruningChange}
            disabled={isChatMode}
            className={toggleInputClassName}
          />
          <span>{t("costControl.enableFramePruning")}</span>
        </label>
      </div>
    </div>
  );
});
