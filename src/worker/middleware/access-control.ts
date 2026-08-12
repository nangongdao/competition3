import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../types";

/**
 * 以恒定时间比较两个字符串是否相等（防时序侧信道）。
 *
 * 对两端做 SHA-256 摘要后逐字节比较；长度不同直接返回 false。
 * 失败路径（无 WebCrypto）退化为普通字符串比较。
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (typeof crypto === "undefined" || crypto.subtle === undefined) {
    return a === b;
  }

  if (a.length !== b.length) {
    return false;
  }

  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(b)),
  ]);

  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let difference = 0;

  for (let index = 0; index < bytesA.length; index += 1) {
    const byteA = bytesA[index] ?? 0;
    const byteB = bytesB[index] ?? 0;
    difference |= byteA ^ byteB;
  }

  return difference === 0;
}

/**
 * 访问控制中间件。
 *
 * 双重校验（均仅在配置后启用，保证本地开发开箱即用）：
 *   1. Origin 必须在白名单内，或与请求自身 Host 同源（阻断第三方站点直接跨域调用）
 *   2. 携带的客户端令牌必须匹配 Worker secret（阻断 curl 直接调用）
 *
 * 令牌不是真正的用户鉴权（前端构建产物可见），但足以阻挡自动化扫描与随手复制。
 * 若需要真实用户体系，应改用 Cloudflare Access 或 JWT。
 */
export function accessControl(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const allowedOrigins = (c.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const origin = c.req.header("origin");
    const host = c.req.header("host") ?? "";
    const isSameOrigin =
      origin !== undefined &&
      host.length > 0 &&
      (origin === `https://${host}` || origin === `http://${host}`);

    if (
      allowedOrigins.length > 0 &&
      origin !== undefined &&
      !isSameOrigin &&
      !allowedOrigins.includes(origin)
    ) {
      throw new HTTPException(403, { message: "Origin not allowed." });
    }

    const expectedToken = c.env.CLIENT_ACCESS_TOKEN;

    if (expectedToken !== undefined && expectedToken.length > 0) {
      const provided = c.req.header("x-client-token");

      if (provided === undefined || !(await timingSafeEqual(provided, expectedToken))) {
        throw new HTTPException(401, { message: "Missing or invalid client token." });
      }
    }

    await next();
  };
}
