/**
 * 调用 Worker AI 端点所需的客户端访问令牌（构建时注入）。
 *
 * 令牌不是真正的用户鉴权 —— 前端构建产物可见 —— 但足以阻挡自动化扫描与
 * 随手复制。部署时通过 `VITE_CLIENT_ACCESS_TOKEN` 注入，且必须与 Worker
 * 侧 `wrangler secret put CLIENT_ACCESS_TOKEN` 的值一致。
 */

/** 客户端令牌请求头名称。 */
export const CLIENT_TOKEN_HEADER = "X-Client-Token";

/**
 * 根据令牌生成请求头。
 *
 * 纯函数：空令牌返回空对象，便于单测。
 */
export function buildClientTokenHeaders(
  token: string | undefined,
): Record<string, string> {
  if (token === undefined || token.trim().length === 0) {
    return {};
  }

  return { [CLIENT_TOKEN_HEADER]: token };
}

/**
 * 为 AI 端点请求附加客户端令牌头。
 *
 * 未配置令牌时原样返回，保证本地开发开箱即用。
 */
export function withClientAccessToken(init: RequestInit = {}): RequestInit {
  const tokenHeaders = buildClientTokenHeaders(
    import.meta.env.VITE_CLIENT_ACCESS_TOKEN,
  );

  if (Object.keys(tokenHeaders).length === 0) {
    return init;
  }

  return {
    ...init,
    headers: {
      ...init.headers,
      ...tokenHeaders,
    },
  };
}
