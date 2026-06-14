import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

import { chatRoutes } from "./routes/chat/router";
import { providerRoutes } from "./routes/provider/router";
import { realtimeRoutes } from "./routes/realtime/router";
import { speechRoutes } from "./routes/speech/router";
import type { AppEnv, HealthResponse } from "./types";

const app = new Hono<AppEnv>();

app.use("*", secureHeaders());

app.route("/api/chat", chatRoutes);
app.route("/api/provider", providerRoutes);
app.route("/api/realtime", realtimeRoutes);
app.route("/api/speech", speechRoutes);

app.get("/api/health", (c) => {
  const response: HealthResponse = {
    success: true,
    service: "ai-visual-dialogue-assistant",
    environment: c.env.ENVIRONMENT ?? "unknown",
    timestamp: Date.now(),
  };

  return c.json(response);
});

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json(
      {
        success: false,
        error: error.message,
      },
      error.status,
    );
  }

  return c.json(
    {
      success: false,
      error: "Internal Server Error",
    },
    500,
  );
});

app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
