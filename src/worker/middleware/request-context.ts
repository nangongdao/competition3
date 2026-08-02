import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export function requestContext(): MiddlewareHandler<AppEnv> {
  return async (c, next): Promise<void> => {
    const suppliedRequestId = c.req.header("x-request-id")?.trim();
    const requestId =
      suppliedRequestId !== undefined &&
      REQUEST_ID_PATTERN.test(suppliedRequestId)
        ? suppliedRequestId
        : crypto.randomUUID();

    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    await next();
  };
}
