import { describe, expect, it } from "vitest";

import {
  getAudioRecordingFileExtension,
  getLocalizedSpeechApiErrorMessage,
  getSupportedAudioRecordingMimeType,
} from "./use-worker-speech-transcription";

describe("worker speech transcription helpers", () => {
  it("selects the first supported MediaRecorder audio type", () => {
    const scope = {
      MediaRecorder: {
        isTypeSupported(mimeType: string): boolean {
          return mimeType === "audio/mp4";
        },
      },
    };

    expect(getSupportedAudioRecordingMimeType(scope)).toBe("audio/mp4");
  });

  it("returns an empty mime type when MediaRecorder is unavailable", () => {
    expect(getSupportedAudioRecordingMimeType({})).toBe("");
  });

  it("maps recording mime types to upload extensions", () => {
    expect(getAudioRecordingFileExtension("audio/mp4")).toBe("m4a");
    expect(getAudioRecordingFileExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(getAudioRecordingFileExtension("audio/wav")).toBe("wav");
    expect(getAudioRecordingFileExtension("audio/webm;codecs=opus")).toBe("webm");
  });

  it("localizes transcription provider failures", () => {
    expect(
      getLocalizedSpeechApiErrorMessage({
        success: false,
        code: "transcription_failed",
        error: "model not found",
      }),
    ).toBe("语音转文字调用失败：model not found");
  });
});
