import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { logWorkerEvent } from "./lib/logger";
import { accessControl } from "./middleware/access-control";
import { rateLimit } from "./middleware/rate-limit";
import { requestContext } from "./middleware/request-context";
import { chatRoutes } from "./routes/chat/router";
import { circuitRoutes } from "./routes/circuit/router";
import { providerRoutes } from "./routes/provider/router";
import { realtimeRoutes } from "./routes/realtime/router";
import { sessionRoutes } from "./routes/sessions/router";
import { speechRoutes } from "./routes/speech/router";
import type { AppEnv, HealthResponse } from "./types";

const MAX_SPEECH_BODY_BYTES = 11 * 1024 * 1024;
const MAX_CHAT_BODY_BYTES = 9 * 1024 * 1024;
const MAX_REALTIME_BODY_BYTES = 64 * 1024;

const app = new Hono<AppEnv>();

app.use("*", requestContext());
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind 运行时需要
      imgSrc: ["'self'", "data:", "blob:"], // 摄像头帧
      mediaSrc: ["'self'", "blob:"],
      // Realtime 的 webrtcUrl 与供应商端点可配置，故允许任意 https/wss 连接
      connectSrc: ["'self'", "https:", "wss:"],
      frameAncestors: ["'none'"],
    },
  }),
);

// CORS：仅允许配置的来源（本地开发跨域到 Worker 时生效；同源部署无需 CORS）
app.use("/api/*", (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : (origin) => origin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Client-Token", "X-Request-Id"],
    maxAge: 86_400,
  })(c, next);
});

// body 体积上限：流层面截断，不信任客户端 content-length（SEC-03）
app.use(
  "/api/speech/*",
  bodyLimit({
    maxSize: MAX_SPEECH_BODY_BYTES,
    onError: (c) =>
      c.json(
        {
          success: false,
          error: "上传内容过大。",
          code: "payload_too_large",
        },
        413,
      ),
  }),
);
app.use("/api/chat/*", bodyLimit({ maxSize: MAX_CHAT_BODY_BYTES }));
app.use("/api/realtime/*", bodyLimit({ maxSize: MAX_REALTIME_BODY_BYTES }));

// 健康检查与 provider 配置无需鉴权（无成本）
app.get("/api/health", (c) => {
  const response: HealthResponse = {
    success: true,
    service: "ai-visual-dialogue-assistant",
    environment: c.env.ENVIRONMENT ?? "unknown",
    timestamp: Date.now(),
  };

  return c.json(response);
});
app.route("/api/provider", providerRoutes);

// 熔断器只读健康端点：无上游成本，不套 accessControl/rateLimit
app.route("/api/circuit", circuitRoutes);

// 会话持久化 CRUD：无上游额度成本，不套 accessControl/rateLimit
app.route("/api/sessions", sessionRoutes);

// 消耗上游额度的端点：鉴权 + 限流（SEC-01）
app.use("/api/chat/*", accessControl(), rateLimit("chat"));
app.use("/api/speech/*", accessControl(), rateLimit("speech"));
app.use("/api/realtime/*", accessControl(), rateLimit("realtime"));

app.route("/api/chat", chatRoutes);
app.route("/api/realtime", realtimeRoutes);
app.route("/api/speech", speechRoutes);

app.onError((error, c) => {
  const requestId = c.get("requestId") ?? crypto.randomUUID();

  if (error instanceof HTTPException) {
    logWorkerEvent("warn", "http_exception", {
      requestId,
      path: c.req.path,
      status: error.status,
    });
    return c.json(
      {
        success: false,
        error: error.message,
      },
      error.status,
    );
  }

  logWorkerEvent("error", "unhandled_request_error", {
    requestId,
    path: c.req.path,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return c.json(
    {
      success: false,
      error: "Internal Server Error",
    },
    500,
  );
});

app.notFound((c) => {
  // 未知 API 路径返回 JSON 404，而不是回退到 SPA index.html，
  // 避免这些请求以 200+HTML 响应并白耗限流配额
  if (c.req.path.startsWith("/api/")) {
    return c.json(
      {
        success: false,
        error: "Not Found",
      },
      404,
    );
  }

  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
