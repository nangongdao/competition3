import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFrameCapture } from "./use-frame-capture";
import type {
  UseFrameCaptureDeps,
  UseFrameCaptureResult,
} from "./use-frame-capture";
import type { FrameSignature } from "@/modules/assistant/lib/frame-diff";

const mocks = vi.hoisted(() => ({
  sampleFrameOffThread: vi.fn(),
}));

vi.mock("@/modules/assistant/lib/frame-processing", () => ({
  MAX_FRAME_WIDTH: 640,
  sampleFrameOffThread: mocks.sampleFrameOffThread,
}));

let captured: UseFrameCaptureResult | undefined;

function Harness(props: { deps: UseFrameCaptureDeps }): React.JSX.Element {
  const result = useFrameCapture(props.deps);
  captured = result;
  return <div data-testid="captured" />;
}

function getResult(): UseFrameCaptureResult {
  if (captured === undefined) {
    throw new Error("useFrameCapture 未被捕获");
  }

  return captured;
}

function makeSignature(seed = 1): FrameSignature {
  return {
    width: 2,
    height: 1,
    luma: [seed / 10, (seed + 1) / 10],
  };
}

type MockContext = {
  getImageData: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
};

type MockCanvas = {
  width: number;
  height: number;
  toDataURL: ReturnType<typeof vi.fn>;
  getContext: ReturnType<typeof vi.fn>;
};

type MockVideo = {
  videoWidth: number;
  videoHeight: number;
};

type Overrides = Partial<Omit<UseFrameCaptureDeps, "videoRef" | "canvasRef">> & {
  video?: MockVideo | null;
  canvas?: MockCanvas | null;
};

function makeDeps(
  overrides: Overrides = {},
): { deps: UseFrameCaptureDeps; ctx: MockContext; canvas: MockCanvas } {
  const context: MockContext = {
    getImageData: vi.fn(() => ({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([120, 90, 60, 255, 130, 95, 65, 255]),
    })),
    drawImage: vi.fn(),
  };

  const canvas: MockCanvas = {
    width: 0,
    height: 0,
    toDataURL: vi.fn(() => "data:image/jpeg;base64,x"),
    getContext: vi.fn(() => context),
  };

  const videoRef = {
    current: (overrides.video ?? {
      videoWidth: 1280,
      videoHeight: 720,
    }) as unknown as HTMLVideoElement | null,
  };
  const canvasRef = {
    current: (
      Object.prototype.hasOwnProperty.call(overrides, "canvas")
        ? overrides.canvas
        : canvas
    ) as unknown as HTMLCanvasElement | null,
  };
  const lastUploadedFrameSignatureRef = {
    current: null as FrameSignature | null,
  };

  const deps: UseFrameCaptureDeps = {
    hasMedia: true,
    dispatch: vi.fn(),
    addTranscript: vi.fn(() => "entry-1"),
    videoRef,
    canvasRef,
    lastUploadedFrameSignatureRef,
    ...overrides,
  };

  return { deps, ctx: context, canvas };
}

function renderHarness(deps: UseFrameCaptureDeps): void {
  captured = undefined;
  renderToStaticMarkup(<Harness deps={deps} />);
}

afterEach(() => {
  captured = undefined;
});

describe("useFrameCapture.captureFrame", () => {
  it("媒体未授权 → 返回 null 并提示先授权", () => {
    const addTranscript = vi.fn(() => "entry-1");
    const { deps } = makeDeps({ hasMedia: false, addTranscript });
    renderHarness(deps);

    const frame = getResult().captureFrame("manual");

    expect(frame).toBeNull();
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      "请先授权摄像头后再采样画面。",
    );
  });

  it("视频未就绪 → 返回 null 并提示先授权", () => {
    const addTranscript = vi.fn(() => "entry-1");
    const { deps } = makeDeps({
      video: { videoWidth: 0, videoHeight: 0 },
      addTranscript,
    });
    renderHarness(deps);

    const frame = getResult().captureFrame("manual");

    expect(frame).toBeNull();
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      "请先授权摄像头后再采样画面。",
    );
  });

  it("canvas 缺失 → 返回 null 并提示先授权", () => {
    const addTranscript = vi.fn(() => "entry-1");
    const { deps } = makeDeps({ canvas: null, addTranscript });
    renderHarness(deps);

    const frame = getResult().captureFrame("manual");

    expect(frame).toBeNull();
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      "请先授权摄像头后再采样画面。",
    );
  });

  it("浏览器无法读取画布 → 返回 null 并提示", () => {
    const addTranscript = vi.fn(() => "entry-1");
    const dispatch = vi.fn();
    const { deps } = makeDeps({ addTranscript });
    const canvas = deps.canvasRef.current as unknown as MockCanvas;
    canvas.getContext = vi.fn(() => null);
    renderHarness({ ...deps, dispatch });

    const frame = getResult().captureFrame("manual");

    expect(frame).toBeNull();
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      "当前浏览器无法读取画面。",
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("成功采样 → dispatch frame-sampled + 提示已采样", () => {
    const addTranscript = vi.fn(() => "entry-1");
    const dispatch = vi.fn();
    const { deps } = makeDeps({ addTranscript });
    renderHarness({ ...deps, dispatch });

    const frame = getResult().captureFrame("manual");

    expect(frame).not.toBeNull();
    expect(frame?.frameDataUrl).toBe("data:image/jpeg;base64,x");
    expect(frame?.signature).toBeTruthy();
    expect(dispatch).toHaveBeenCalledWith({
      type: "frame-sampled",
      dataUrl: "data:image/jpeg;base64,x",
    });
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      "已采样当前画面。",
    );
  });

  it("auto 采样成功 → 仅 dispatch，不展示提示", () => {
    const addTranscript = vi.fn(() => "entry-1");
    const dispatch = vi.fn();
    const { deps } = makeDeps({ addTranscript });
    renderHarness({ ...deps, dispatch });

    const frame = getResult().captureFrame("auto");

    expect(frame).not.toBeNull();
    expect(dispatch).toHaveBeenCalledWith({
      type: "frame-sampled",
      dataUrl: "data:image/jpeg;base64,x",
    });
    expect(addTranscript).not.toHaveBeenCalled();
  });

  it("同步成功采样 → 也记录采样节拍遥测", () => {
    const dispatch = vi.fn();
    const recordSampleTick = vi.fn();
    const { deps } = makeDeps({ dispatch, recordSampleTick });
    renderHarness(deps);

    const frame = getResult().captureFrame("manual");

    expect(frame).not.toBeNull();
    expect(recordSampleTick).toHaveBeenCalledTimes(1);
  });
});

describe("useFrameCapture.captureFrameAsync", () => {
  it("媒体未授权 → 回退同步路径并提示", async () => {
    const addTranscript = vi.fn(() => "entry-1");
    const { deps } = makeDeps({ hasMedia: false, addTranscript });
    renderHarness(deps);

    const frame = await getResult().captureFrameAsync("manual");

    expect(frame).toBeNull();
    expect(addTranscript).toHaveBeenCalledWith(
      "system",
      "请先授权摄像头后再采样画面。",
    );
  });

  it("Worker 离屏处理成功 → dispatch + 触发 recordFrameSample 遥测", async () => {
    mocks.sampleFrameOffThread.mockResolvedValueOnce({
      dataUrl: "data:image/jpeg;base64,worker-frame",
      signature: makeSignature(5),
      processMs: 3.2,
    });
    const dispatch = vi.fn();
    const recordFrameSample = vi.fn();
    const recordSampleTick = vi.fn();
    const { deps } = makeDeps({ dispatch, recordFrameSample, recordSampleTick });
    renderHarness(deps);

    const frame = await getResult().captureFrameAsync("auto");

    expect(frame).not.toBeNull();
    expect(frame?.frameDataUrl).toBe("data:image/jpeg;base64,worker-frame");
    expect(dispatch).toHaveBeenCalledWith({
      type: "frame-sampled",
      dataUrl: "data:image/jpeg;base64,worker-frame",
    });
    expect(recordFrameSample).toHaveBeenCalledWith(3.2);
    // 采样节拍遥测：离屏成功路径也记录一次采样时间戳
    expect(recordSampleTick).toHaveBeenCalledTimes(1);
  });

  it("Worker 离屏处理失败（返回 null）→ 回退同步路径且不触发遥测", async () => {
    mocks.sampleFrameOffThread.mockResolvedValueOnce(null);
    const addTranscript = vi.fn(() => "entry-1");
    const recordFrameSample = vi.fn();
    const recordSampleTick = vi.fn();
    const { deps } = makeDeps({ addTranscript, recordFrameSample, recordSampleTick });
    renderHarness(deps);

    const frame = await getResult().captureFrameAsync("manual");

    // 回退到同步 captureFrame 成功路径
    expect(frame).not.toBeNull();
    expect(recordFrameSample).not.toHaveBeenCalled();
    // 同步回退路径也记录采样节拍（覆盖回退场景）
    expect(recordSampleTick).toHaveBeenCalledTimes(1);
  });
});

describe("useFrameCapture.recordUploadedFrame", () => {
  it("更新基线签名 + dispatch frame-sent", () => {
    const dispatch = vi.fn();
    const lastUploadedFrameSignatureRef = {
      current: null as FrameSignature | null,
    };
    const { deps } = makeDeps({ lastUploadedFrameSignatureRef });
    renderHarness({ ...deps, dispatch });

    const signature = makeSignature(3);
    getResult().recordUploadedFrame(signature);

    expect(lastUploadedFrameSignatureRef.current).toBe(signature);
    expect(dispatch).toHaveBeenCalledWith({ type: "frame-sent" });
  });
});
