import { describe, expect, it } from "vitest";

import {
  collectFinalRecognitionTranscript,
  getBrowserSpeechSupport,
  getRecognitionErrorMessage,
  type BrowserSpeechScope,
  type RecognitionResultListLike,
} from "./use-browser-speech-adapter";

function createRecognitionResult(
  isFinal: boolean,
  transcript: string,
): ReturnType<RecognitionResultListLike["item"]> {
  return {
    isFinal,
    length: 1,
    item: (index: number) => {
      if (index !== 0) {
        throw new Error("missing speech alternative");
      }

      return {
        transcript,
      };
    },
  };
}

function createRecognitionResultList(
  results: readonly ReturnType<RecognitionResultListLike["item"]>[],
): RecognitionResultListLike {
  return {
    length: results.length,
    item: (index: number) => {
      const result = results[index];

      if (result === undefined) {
        throw new Error("missing speech result");
      }

      return result;
    },
  };
}

describe("collectFinalRecognitionTranscript", () => {
  it("combines final recognition segments and trims whitespace", () => {
    const results = createRecognitionResultList([
      createRecognitionResult(true, "  ???  "),
      createRecognitionResult(true, "???"),
    ]);

    expect(collectFinalRecognitionTranscript(results)).toBe("??? ???");
  });

  it("ignores interim and empty recognition results", () => {
    const results = createRecognitionResultList([
      createRecognitionResult(false, "????"),
      createRecognitionResult(true, "   "),
      createRecognitionResult(true, "????"),
    ]);

    expect(collectFinalRecognitionTranscript(results)).toBe("????");
  });
});

describe("getBrowserSpeechSupport", () => {
  it("detects speech recognition and synthesis support", () => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend = null;
      start(): void {
        this.continuous = false;
      }
      stop(): void {
        this.interimResults = false;
      }
      abort(): void {
        this.maxAlternatives = 1;
      }
    }

    class FakeUtterance {
      readonly text: string;

      constructor(text = "") {
        this.text = text;
      }
    }

    const scope: BrowserSpeechScope = {
      SpeechRecognition: FakeRecognition,
      speechSynthesis: {
        cancel: () => undefined,
        speak: () => undefined,
      } as unknown as SpeechSynthesis,
      SpeechSynthesisUtterance:
        FakeUtterance as unknown as BrowserSpeechScope["SpeechSynthesisUtterance"],
    };

    expect(getBrowserSpeechSupport(scope)).toEqual({
      recognition: true,
      synthesis: true,
    });
  });

  it("returns false support when no browser speech APIs exist", () => {
    expect(getBrowserSpeechSupport({})).toEqual({
      recognition: false,
      synthesis: false,
    });
  });
});

describe("getRecognitionErrorMessage", () => {
  it("maps permission denial to a specific Chinese message", () => {
    expect(getRecognitionErrorMessage("not-allowed")).toBe(
      "?????????????",
    );
  });

  it("maps unknown errors to a safe fallback", () => {
    expect(getRecognitionErrorMessage("unknown-code")).toBe(
      "??????????",
    );
  });
});