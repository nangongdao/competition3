import { test, expect } from "@playwright/test";

/**
 * M5.1 E2E — Realtime 完整启停路径（mock WebRTC + mock 后端）。
 *
 * 在 headless 无法提供真实摄像头/麦克风与 WebRTC 点对点连接的情况下，
 * 通过 `addInitScript` 在页面加载前注入：
 *   - `navigator.mediaDevices.getUserMedia` 返回带音频轨的假 MediaStream
 *   - 最小可用的 `RTCPeerConnection` / `RTCDataChannel`（创建后立即 open）
 *   - `MediaStream` 构造器
 * 并 mock `/api/realtime/session`（创建会话）+ WebRTC SDP 交换，从而验证：
 *   1. 授权媒体后 Realtime 启动按钮变为可用
 *   2. 点击启动后进入 connecting → listening（连接成功）
 *   3. 点击停止后回到待机状态（完整启停闭环）
 *
 * 纯前端 + mock API + mock WebRTC，可在 headless 下稳定运行。
 */

const WEBCRTC_ANSWER_SDP =
  "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=sctp-port:5000\r\n";

async function mockRealtimeBackend(
  page: import("@playwright/test").Page,
): Promise<void> {
  // 页面加载前注入 WebRTC / 媒体 API 桩。
  await page.addInitScript(() => {
    // --- 媒体采集：用原生 AudioContext 生成真实 MediaStream + 音频轨 ---
    // 这样 HTMLMediaElement.srcObject 能正确绑定（浏览器要求真 MediaStream 实例），
    // 且 stream.getAudioTracks()[0] 返回真实音频轨，满足 Realtime 启动前置校验。
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const audioContext = new AudioContext();
          const destination = audioContext.createMediaStreamDestination();
          // 写入少量静音以保持音频轨存活。
          const oscillator = audioContext.createOscillator();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        },
      },
    });

    // --- 最小 RTCPeerConnection / RTCDataChannel ---
    type FakeListener = (event: { data?: string; type?: string }) => void;

    class FakeDataChannel {
      readyState: "open" | "connecting" = "connecting";
      listeners: Record<string, FakeListener[]> = {};
      addEventListener(type: string, listener: FakeListener): void {
        (this.listeners[type] ??= []).push(listener);
      }
      removeEventListener(type: string, listener: FakeListener): void {
        // 冒烟桩不需要真正移除监听器。
        void type;
        void listener;
      }
      send(data: string): void {
        // 冒烟桩不真正发送数据。
        void data;
      }
      close(): void {
        this.readyState = "closed";
      }
      emitOpen(): void {
        this.readyState = "open";
        (this.listeners["open"] ?? []).forEach((l) => l({ type: "open" }));
      }
    }

    class FakePeerConnection {
      connectionState = "connecting";
      localDescription: { sdp: string; type: string } | null = null;
      channel: FakeDataChannel;
      stateListeners: FakeListener[] = [];
      trackListeners: FakeListener[] = [];
      channelListeners: FakeListener[] = [];

      constructor() {
        this.channel = new FakeDataChannel();
      }
      createDataChannel(label: string): FakeDataChannel {
        void label;
        return this.channel;
      }
      addEventListener(type: string, listener: FakeListener): void {
        if (type === "connectionstatechange") {
          this.stateListeners.push(listener);
        } else if (type === "track") {
          this.trackListeners.push(listener);
        } else if (type === "datachannel") {
          this.channelListeners.push(listener);
        }
      }
      removeEventListener(): void {
        /* no-op */
      }
      addTrack(): void {
        /* no-op */
      }
      async createOffer(): Promise<{ type: string; sdp: string }> {
        return { type: "offer", sdp: "fake-offer-sdp" };
      }
      async setLocalDescription(desc: { type: string; sdp: string }): Promise<void> {
        this.localDescription = desc;
      }
      async setRemoteDescription(): Promise<void> {
        // 模拟 SDP answer 接受后点对点连接与数据通道就绪。
        this.connectionState = "connected";
        this.stateListeners.forEach((l) => l({ type: "connectionstatechange" }));
        this.channel.emitOpen();
      }
      close(): void {
        this.connectionState = "closed";
        this.stateListeners.forEach((l) => l({ type: "connectionstatechange" }));
      }
    }

    (globalThis as Record<string, unknown>)["RTCPeerConnection"] = FakePeerConnection;
  });

  // Mock provider config：realtime 模式。
  await page.route("**/api/provider/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        providerMode: "realtime",
        visionCapability: "none",
      }),
    }),
  );

  // Mock 会话创建。
  await page.route("**/api/realtime/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { client_secret: "fake-client-secret" },
        webrtcUrl: "http://127.0.0.1:4173/api/realtime/webrtc",
        costPolicy: {
          visualContextMode: "manual",
          turnDetectionMode: "server-vad",
          responseBudget: "standard",
          maxResponseOutputTokens: 1200,
          maxSessionSeconds: 600,
          frameUpload: "manual-or-interval",
        },
      }),
    }),
  );

  // Mock WebRTC SDP 交换。
  await page.route("**/api/realtime/webrtc", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/sdp",
      body: WEBCRTC_ANSWER_SDP,
    }),
  );
}

test("Realtime 完整启停路径（授权→启动→监听→停止） @smoke", async ({ page }) => {
  await mockRealtimeBackend(page);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 1. 授权媒体（mock getUserMedia 返回假音频轨）。
  const authorizeButton = page.getByRole("button", { name: "Authorize" });
  await expect(authorizeButton).toBeEnabled({ timeout: 15_000 });
  await authorizeButton.click();

  // 授权后 Realtime 启动按钮应变为可用。
  const startButton = page.getByRole("button", { name: "Start session" });
  await expect(startButton).toBeEnabled({ timeout: 15_000 });

  // 2. 点击启动 → 走完 mock 会话创建 + WebRTC 建连 → 进入监听态。
  await startButton.click();
  await expect(
    page.getByText("Realtime 会话已连接。").first(),
  ).toBeVisible({ timeout: 20_000 });

  // 停止按钮在连接成功后可用。
  const stopButton = page.getByRole("button", { name: "Stop session" });
  await expect(stopButton).toBeEnabled({ timeout: 15_000 });

  // 3. 点击停止 → 回到待机态（再次出现可用的 Authorize/Start）。
  await stopButton.click();
  await expect(
    page.getByRole("button", { name: "Start session" }),
  ).toBeEnabled({ timeout: 15_000 });
});
