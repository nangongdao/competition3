import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type RecognitionAlternativeLike = {
  transcript: string;
};

type RecognitionResultLike = {
  isFinal: boolean;
  length: number;
  item(index: number): RecognitionAlternativeLike;
};

export type RecognitionResultListLike = {
  length: number;
  item(index: number): RecognitionResultLike;
};

type RecognitionResultEventLike = Event & {
  results: RecognitionResultListLike;
};

type RecognitionErrorEventLike = Event & {
  error?: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type SpeechSynthesisUtteranceConstructor = new (
  text?: string,
) => SpeechSynthesisUtterance;

export type BrowserSpeechScope = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: SpeechSynthesisUtteranceConstructor;
};

export type BrowserSpeechSupport = {
  recognition: boolean;
  synthesis: boolean;
};

export type BrowserSpeechRecognitionStatus =
  | "unsupported"
  | "idle"
  | "listening"
  | "error";

export type BrowserSpeechAdapterState = {
  isRecognitionSupported: boolean;
  isSynthesisSupported: boolean;
  recognitionStatus: BrowserSpeechRecognitionStatus;
  recognitionError?: string;
  isSpeaking: boolean;
};

type UseBrowserSpeechAdapterInput = {
  language: string;
  onTranscript: (text: string) => void;
  onStatusMessage: (message: string) => void;
};

type UseBrowserSpeechAdapterResult = {
  speechState: BrowserSpeechAdapterState;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  cancelSpeech: () => void;
};

function getBrowserSpeechScope(): BrowserSpeechScope | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as unknown as BrowserSpeechScope;
}

function getSpeechRecognitionConstructor(
  scope: BrowserSpeechScope | null,
): SpeechRecognitionConstructor | null {
  return scope?.SpeechRecognition ?? scope?.webkitSpeechRecognition ?? null;
}

export function getBrowserSpeechSupport(
  scope: BrowserSpeechScope | null = getBrowserSpeechScope(),
): BrowserSpeechSupport {
  return {
    recognition: getSpeechRecognitionConstructor(scope) !== null,
    synthesis:
      scope?.speechSynthesis !== undefined &&
      scope.SpeechSynthesisUtterance !== undefined,
  };
}

export function collectFinalRecognitionTranscript(
  results: RecognitionResultListLike,
): string {
  const finalSegments: string[] = [];

  for (let index = 0; index < results.length; index += 1) {
    const result = results.item(index);

    if (!result.isFinal || result.length === 0) {
      continue;
    }

    const transcript = result.item(0).transcript.trim();

    if (transcript.length > 0) {
      finalSegments.push(transcript);
    }
  }

  return finalSegments.join(" ");
}

export function getRecognitionErrorMessage(errorCode: string | undefined): string {
  if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
    return "浏览器拒绝了语音识别权限。";
  }

  if (errorCode === "no-speech") {
    return "没有识别到语音，请再试一次。";
  }

  if (errorCode === "audio-capture") {
    return "浏览器无法访问麦克风。";
  }

  if (errorCode === "network") {
    return "浏览器语音识别服务网络异常，请改用键盘输入，或更换浏览器/网络后重试。";
  }

  if (errorCode === "language-not-supported") {
    return "当前浏览器不支持所选识别语言。";
  }

  return "语音识别失败。";
}

export function useBrowserSpeechAdapter({
  language,
  onTranscript,
  onStatusMessage,
}: UseBrowserSpeechAdapterInput): UseBrowserSpeechAdapterResult {
  const support = useMemo(() => getBrowserSpeechSupport(), []);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const [speechState, setSpeechState] = useState<BrowserSpeechAdapterState>({
    isRecognitionSupported: support.recognition,
    isSynthesisSupported: support.synthesis,
    recognitionStatus: support.recognition ? "idle" : "unsupported",
    isSpeaking: false,
  });

  const cancelSpeech = useCallback((): void => {
    const scope = getBrowserSpeechScope();

    if (scope?.speechSynthesis === undefined) {
      return;
    }

    scope.speechSynthesis.cancel();
    setSpeechState((current) => ({
      ...current,
      isSpeaking: false,
    }));
  }, []);

  const stopListening = useCallback((): void => {
    const recognition = recognitionRef.current;

    if (recognition === null) {
      return;
    }

    recognition.stop();
  }, []);

  const startListening = useCallback((): void => {
    const scope = getBrowserSpeechScope();
    const SpeechRecognition = getSpeechRecognitionConstructor(scope);

    if (SpeechRecognition === null) {
      setSpeechState((current) => ({
        ...current,
        recognitionStatus: "unsupported",
        recognitionError: "当前浏览器不支持语音识别。",
      }));
      onStatusMessage("当前浏览器不支持语音识别。");
      return;
    }

    if (recognitionRef.current !== null) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event): void => {
      const transcript = collectFinalRecognitionTranscript(event.results);

      if (transcript.length === 0) {
        onStatusMessage("没有识别到可发送的文字。");
        return;
      }

      onTranscript(transcript);
    };

    recognition.onerror = (event): void => {
      const message = getRecognitionErrorMessage(event.error);
      recognitionRef.current = null;
      setSpeechState((current) => ({
        ...current,
        recognitionStatus: "error",
        recognitionError: message,
      }));
      onStatusMessage(message);
    };

    recognition.onend = (): void => {
      recognitionRef.current = null;
      setSpeechState((current) =>
        current.recognitionStatus === "listening"
          ? {
              ...current,
              recognitionStatus: "idle",
            }
          : current,
      );
    };

    recognitionRef.current = recognition;
    setSpeechState((current) => ({
      ...current,
      recognitionStatus: "listening",
      recognitionError: undefined,
    }));
    onStatusMessage("正在进行 Chat 语音输入。");

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setSpeechState((current) => ({
        ...current,
        recognitionStatus: "error",
        recognitionError: "语音识别启动失败。",
      }));
      onStatusMessage("语音识别启动失败。");
    }
  }, [language, onStatusMessage, onTranscript]);

  const speak = useCallback(
    (text: string): void => {
      const trimmedText = text.trim();

      if (trimmedText.length === 0) {
        return;
      }

      const scope = getBrowserSpeechScope();

      if (
        scope?.speechSynthesis === undefined ||
        scope.SpeechSynthesisUtterance === undefined
      ) {
        onStatusMessage("当前浏览器不支持语音朗读。");
        return;
      }

      const utterance = new scope.SpeechSynthesisUtterance(trimmedText);
      utterance.lang = language;
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onend = (): void => {
        setSpeechState((current) => ({
          ...current,
          isSpeaking: false,
        }));
      };

      utterance.onerror = (): void => {
        setSpeechState((current) => ({
          ...current,
          isSpeaking: false,
        }));
        onStatusMessage("语音朗读失败。");
      };

      scope.speechSynthesis.cancel();
      setSpeechState((current) => ({
        ...current,
        isSpeaking: true,
      }));
      scope.speechSynthesis.speak(utterance);
    },
    [language, onStatusMessage],
  );

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;

      if (recognition !== null) {
        recognition.abort();
      }

      const scope = getBrowserSpeechScope();
      scope?.speechSynthesis?.cancel();
    };
  }, []);

  return {
    speechState,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
