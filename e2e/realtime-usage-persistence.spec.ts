import { test, expect, type Page } from "@playwright/test";

/**
 * E2E 补强 — Realtime 用量持久化 + 会话级用量导出 + 全局累计视图。
 *
 * 在既有 Realtime 启停 mock（原生 AudioContext 假流 + 最小 RTCPeerConnection）
 * 基础上，补充：
 *   - mock `/api/sessions*` 后端返回已有会话及其 D1 持久化用量记录；
 *   - 启动 Realtime 后注入 `response.done` 服务器事件（带权威 usage），
 *     验证前端把每轮用量 POST 到 `/:id/usage`（会话级持久化）；
 *   - 会话恢复后成本面板回填历史累计用量，并出现「会话级用量导出」区；
 *   - 侧边栏展示「全局跨会话累计用量」面板。
 *
 * 纯前端 + mock API + mock WebRTC，可在 headless 下稳定运行。
 */

const WEBCRTC_ANSWER_SDP =
  "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=sctp-port:5000\r\n";

const SESSION = {
  id: "sess-001",
  title: "历史 Realtime 会话",
  providerMode: "realtime",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  messageCount: 0,
};

/** D1 中已持久化的会话用量记录（恢复后回填成本面板）。 */
const PERSISTED_ENTRIES = [
  {
    id: "u-1",
    sessionId: SESSION.id,
    mode: "realtime",
    inputTokens: 1500,
    inputTextTokens: 200,
    inputAudioTokens: 1000,
    inputImageTokens: 300,
    cachedInputTokens: 500,
    cachedTextTokens: 100,
    cachedAudioTokens: 300,
    cachedImageTokens: 100,
    outputTokens: 80,
    outputTextTokens: 20,
    outputAudioTokens: 60,
    estimatedCostUsd: 0.0007,
    recordedAt: 1_700_000_000_100,
  },
] as const;

const SESSION_TOTALS = {
  turnCount: 1,
  inputTokens: 1500,
  inputTextTokens: 200,
  inputAudioTokens: 1000,
  inputImageTokens: 300,
  cachedInputTokens: 500,
  cachedTextTokens: 100,
  cachedAudioTokens: 300,
  cachedImageTokens: 100,
  outputTokens: 80,
  outputTextTokens: 20,
  outputAudioTokens: 60,
  estimatedCostUsd: 0.0007,
};

/** 全局跨会话累计（含其它会话）。 */
const GLOBAL_TOTALS = {
  turnCount: 5,
  inputTokens: 9000,
  inputTextTokens: 1200,
  inputAudioTokens: 6000,
  inputImageTokens: 1800,
  cachedInputTokens: 800,
  cachedTextTokens: 200,
  cachedAudioTokens: 400,
  cachedImageTokens: 200,
  outputTokens: 400,
  outputTextTokens: 100,
  outputAudioTokens: 300,
  estimatedCostUsd: 0.0042,
};

async function mockRealtimeWebRtc(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const audioContext = new AudioContext();
          const destination = audioContext.createMediaStreamDestination();
          const oscillator = audioContext.createOscillator();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        },
      },
    });

    type FakeListener = (event: { data?: string; type?: string }) => void;

    class FakeDataChannel {
      readyState: "open" | "connecting" = "connecting";
      listeners: Record<string, FakeListener[]> = {};
      addEventListener(type: string, listener: FakeListener): void {
        (this.listeners[type] ??= []).push(listener);
      }
      removeEventListener(type: string, listener: FakeListener): void {
        void type;
        void listener;
      }
      send(data: string): void {
        void data;
      }
      close(): void {
        this.readyState = "closed";
      }
      emitOpen(): void {
        this.readyState = "open";
        (this.listeners["open"] ?? []).forEach((l) => l({ type: "open" }));
      }
      emitMessage(data: string): void {
        (this.listeners["message"] ?? []).forEach((l) => l({ data }));
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
        // 暴露给测试驱动：注入 response.done 服务器事件。
        (globalThis as Record<string, unknown>)["__fakeChannel__"] = this.channel;
        (globalThis as Record<string, unknown>)["__fakePC__"] = this;
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
}

async function mockBackend(
  page: Page,
  usagePosts: { body: Record<string, unknown> }[],
): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("app-language", "en");
  });

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

  // 会话列表：返回一个历史 Realtime 会话。
  await page.route("**/api/sessions?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        sessions: [SESSION],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    }),
  );

  // 全局跨会话累计用量。
  await page.route("**/api/sessions/usage/totals", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, totals: GLOBAL_TOTALS }),
    }),
  );

  // 恢复会话详情（无消息）。
  await page.route(`**/api/sessions/${SESSION.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session: { ...SESSION, messages: [] },
      }),
    }),
  );

  // 读取会话级持久化用量（恢复回填）。
  await page.route(`**/api/sessions/${SESSION.id}/usage`, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      usagePosts.push({ body });
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          entry: { ...PERSISTED_ENTRIES[0], ...body },
        }),
      });
      return;
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        entries: PERSISTED_ENTRIES,
        totals: SESSION_TOTALS,
      }),
    });
  });

  // Mock Realtime 会话创建。
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

test("Realtime 用量持久化 + 会话级导出 + 全局累计视图 @smoke", async ({
  page,
}) => {
  const usagePosts: { body: Record<string, unknown> }[] = [];
  await mockRealtimeWebRtc(page);
  await mockBackend(page, usagePosts);

  await page.goto("/");
  await expect(page).toHaveTitle(/AI Visual Dialogue Assistant/);

  // 1. 恢复会话后，成本面板回填持久化用量（Realtime usage 面板可见）。
  const usagePanel = page.getByLabel("Realtime usage");
  await expect(usagePanel).toBeVisible({ timeout: 15_000 });

  // 1b. 账单来源标注出现（① 功能增量：Realtime 权威计量 + provider 核对提示）。
  await expect(
    page.getByLabel("Bill source & cost basis"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByLabel("Bill source & cost basis"),
  ).toContainText("response.done");

  // 2. 会话级用量导出区出现（有持久化记录时展示 JSON/CSV 导出）。
  await expect(
    page.getByLabel("Session usage export"),
  ).toBeVisible({ timeout: 15_000 });

  // 2b. 会话级用量趋势图表出现（② 功能增量：持久化记录折叠为趋势可视化）。
  await expect(
    page.getByLabel("Session usage trend"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Session usage trend")).toContainText(
    "Usage trend",
  );

  // 3. 打开侧边栏 → 全局累计用量面板展示跨会话 totals。
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(
    page.getByLabel("Global usage"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Global usage")).toContainText("Cross-session usage");
  await page.getByRole("button", { name: /Close session sidebar/ }).last().click();
  await expect(page.getByLabel("Global usage")).toBeHidden();

  // 4. 授权媒体并启动 Realtime 会话。
  const authorizeButton = page.getByRole("button", { name: "Authorize" });
  await expect(authorizeButton).toBeEnabled({ timeout: 15_000 });
  await authorizeButton.click();

  const startButton = page.getByRole("button", { name: "Start session" });
  await expect(startButton).toBeEnabled({ timeout: 15_000 });
  await startButton.click();
  await expect(
    page.getByText("Realtime 会话已连接。").first(),
  ).toBeVisible({ timeout: 20_000 });

  // 5. 注入一条带权威 usage 的 response.done 服务器事件。
  await page.evaluate(() => {
    const pc = (globalThis as Record<string, unknown>)["__fakePC__"];
    void pc;
    // 通过全局注入的 FakePeerConnection 实例触发数据通道 message 事件。
    // （在 addInitScript 中我们把 channel 挂到 window，供测试驱动。）
    const fakeChannel = (
      globalThis as Record<string, unknown>
    )["__fakeChannel__"] as {
      emitMessage: (data: string) => void;
    };
    fakeChannel.emitMessage(
      JSON.stringify({
        type: "response.done",
        response: {
          usage: {
            input_tokens: 1500,
            input_token_details: {
              text_tokens: 200,
              audio_tokens: 1000,
              image_tokens: 300,
              cached_tokens: 500,
              cached_tokens_details: {
                text_tokens: 100,
                audio_tokens: 300,
                image_tokens: 100,
              },
            },
            output_tokens: 80,
            output_token_details: {
              text_tokens: 20,
              audio_tokens: 60,
            },
          },
        },
      }),
    );
  });

  // 6. 前端把该轮权威用量 POST 到会话级用量持久化端点。
  await expect
    .poll(async () => usagePosts.length, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(1);
  expect(usagePosts[0]?.body.mode).toBe("realtime");
  expect(usagePosts[0]?.body.inputTokens).toBe(1500);
  expect(usagePosts[0]?.body.outputTokens).toBe(80);

  // 7. 成本面板累计用量增长（持久化回填 1 轮 + 新计量 1 轮 → 轮次 2）。
  await expect(usagePanel).toContainText("2");
});
