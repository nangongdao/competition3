import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRealtimeSession,
  establishRealtimePeerConnection,
  isApiErrorResponse,
  readSdpError,
  waitForDataChannelOpen,
} from "./realtime-session-api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeSessionResponse() {
  return {
    success: true,
    session: { id: "s1" },
    webrtcUrl: "https://example.com/webrtc",
    costPolicy: {
      visualContextMode: "manual",
      turnDetectionMode: "server-vad",
      responseBudget: "standard",
      maxResponseOutputTokens: 4096,
      maxSessionSeconds: 600,
      frameUpload: "manual-or-interval",
    },
  };
}

describe("isApiErrorResponse", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a worker error payload", () => {
    expect(
      isApiErrorResponse({ success: false, error: "boom", code: "invalid_request" }),
    ).toBe(true);
  });

  it("rejects non-record and malformed payloads", () => {
    expect(isApiErrorResponse(null)).toBe(false);
    expect(isApiErrorResponse("nope")).toBe(false);
    expect(isApiErrorResponse({ success: false })).toBe(false);
    expect(isApiErrorResponse({ success: true })).toBe(false);
  });
});

describe("createRealtimeSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts session input and returns the worker success response", async () => {
    const body = makeSessionResponse();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

    const result = await createRealtimeSession({
      visualContextMode: "manual",
      turnDetectionMode: "server-vad",
      responseBudget: "standard",
      instructions: "你好",
    });

    expect(result.webrtcUrl).toBe("https://example.com/webrtc");
    expect(fetch).toHaveBeenCalledWith(
      "/api/realtime/session",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("omits instructions when not provided", async () => {
    const body = makeSessionResponse();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    await createRealtimeSession({
      visualContextMode: "manual",
      turnDetectionMode: "server-vad",
      responseBudget: "standard",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("instructions");
  });

  it("throws a localized message when the worker returns an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          { success: false, error: "bad", code: "invalid_request" },
          400,
        ),
      ),
    );

    await expect(
      createRealtimeSession({
        visualContextMode: "manual",
        turnDetectionMode: "server-vad",
        responseBudget: "standard",
      }),
    ).rejects.toThrow("Realtime 会话请求参数无效。");
  });

  it("throws when the response violates the contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    await expect(
      createRealtimeSession({
        visualContextMode: "manual",
        turnDetectionMode: "server-vad",
        responseBudget: "standard",
      }),
    ).rejects.toThrow("Realtime 会话响应不符合预期契约。");
  });
});

describe("readSdpError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the server message when present", async () => {
    const response = new Response("offer rejected", { status: 400 });
    await expect(readSdpError(response)).resolves.toBe("offer rejected");
  });

  it("falls back to a generic message when empty", async () => {
    const response = new Response("   ", { status: 400 });
    await expect(readSdpError(response)).resolves.toMatch(/状态码 400/);
  });
});

describe("waitForDataChannelOpen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function createFakeDataChannel(initialState: RTCDataChannelState = "connecting") {
    const listeners: Record<string, ((event?: unknown) => void)[]> = {};
    const channel = {
      readyState: initialState,
      addEventListener: vi.fn((type: string, cb: () => void) => {
        (listeners[type] ??= []).push(cb);
      }),
      removeEventListener: vi.fn(),
    } as unknown as RTCDataChannel;

    const emit = (type: string): void => {
      (listeners[type] ?? []).forEach((cb) => cb());
    };

    return { channel, emit, listeners };
  }

  it("resolves immediately when already open", async () => {
    const { channel } = createFakeDataChannel("open");
    await expect(waitForDataChannelOpen(channel)).resolves.toBeUndefined();
  });

  it("resolves when the channel transitions to open", async () => {
    vi.useFakeTimers();
    const { channel, emit } = createFakeDataChannel("connecting");
    const promise = waitForDataChannelOpen(channel);
    emit("open");
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when the channel fails", async () => {
    vi.useFakeTimers();
    const { channel, emit } = createFakeDataChannel("connecting");
    const promise = waitForDataChannelOpen(channel);
    emit("error");
    await expect(promise).rejects.toThrow("打开失败");
  });
});

describe("establishRealtimePeerConnection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makePeerStub() {
    const connectionState = { value: "connecting" as RTCPeerConnectionState };
    const listeners: Record<string, ((event?: unknown) => void)[]> = {};
    const dataChannelListeners: Record<
      string,
      ((event?: unknown) => void)[]
    > = {};
    const peerConnection = {
      connectionState,
      addEventListener: vi.fn((type: string, cb: () => void) => {
        (listeners[type] ??= []).push(cb);
      }),
      createDataChannel: vi.fn(() => ({
        readyState: "open",
        addEventListener: vi.fn((type: string, cb: () => void) => {
          (dataChannelListeners[type] ??= []).push(cb);
        }),
        removeEventListener: vi.fn(),
      })),
      createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "offer-sdp" }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockResolvedValue(undefined),
      addTrack: vi.fn(),
      localDescription: { type: "offer", sdp: "offer-sdp" },
    } as unknown as RTCPeerConnection;

    const emit = (type: string): void => {
      (listeners[type] ?? []).forEach((cb) => cb());
    };

    return { peerConnection, emit };
  }

  it("exchanges SDP and returns the peer connection + data channel", async () => {
    const { peerConnection } = makePeerStub();
    const localStream = {
      getAudioTracks: () => [{ id: "audio-1" }],
    } as unknown as MediaStream;

    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn(function () {
        return peerConnection;
      }) as unknown as typeof RTCPeerConnection,
    );
    vi.stubGlobal("MediaStream", class {
      addTrack = vi.fn();
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("answer-sdp")));

    const callbacks = {
      onStateChange: vi.fn(),
      onFailed: vi.fn(),
      onTrack: vi.fn(),
      onDataMessage: vi.fn(),
    };

    const result = await establishRealtimePeerConnection(
      localStream,
      { webrtcUrl: "https://example.com/webrtc", clientSecret: "secret" },
      callbacks,
    );

    expect(result.peerConnection).toBe(peerConnection);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/webrtc",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("forwards data channel messages to the onDataMessage callback", async () => {
    const { peerConnection } = makePeerStub();
    const localStream = {
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    vi.stubGlobal(
      "RTCPeerConnection",
      vi.fn(function () {
        return peerConnection;
      }) as unknown as typeof RTCPeerConnection,
    );
    vi.stubGlobal("MediaStream", class {
      addTrack = vi.fn();
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("answer-sdp")));

    const callbacks = {
      onStateChange: vi.fn(),
      onFailed: vi.fn(),
      onTrack: vi.fn(),
      onDataMessage: vi.fn(),
    };

    await establishRealtimePeerConnection(
      localStream,
      { webrtcUrl: "https://example.com/webrtc", clientSecret: "secret" },
      callbacks,
    );

    const dataChannel = (
      peerConnection.createDataChannel as ReturnType<typeof vi.fn>
    ).mock.results[0].value as {
      addEventListener: ReturnType<typeof vi.fn>;
    };
    const messageCalls = dataChannel.addEventListener.mock.calls.filter(
      ([type]) => type === "message",
    );
    messageCalls.forEach(([, cb]) => {
      (cb as (event: { data: string }) => void)({
        data: '{"type":"response.created"}',
      });
    });

    expect(callbacks.onDataMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "response.created" }),
    );
  });
});
