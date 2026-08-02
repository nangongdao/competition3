# competition3 升级改造方案 —— AI 视觉对话助手

> 审计日期：2026-08-01
> 审计对象：`E:\competition3`（React 19 + Vite 前端 `app/`，Cloudflare Workers + Hono 后端 `src/worker/`，约 10,275 行 TS）
> 审计方式：静态代码审查 + 实际运行 typecheck/测试/部署干跑

---

## 0. 执行摘要

### 0.1 项目现状评级

| 维度 | 评级 | 说明 |
|---|---|---|
| **可部署性** | **★☆☆☆☆** | **`wrangler deploy` 直接报错失败，当前根本无法上线（DEPLOY-01）** |
| 输入校验 | ★★★☆☆ | zod schema 严谨，但请求体整体读取无保护、可绕过（SEC-03） |
| 密钥管理 | ★★★★★ | 密钥全部在 Worker 侧，前端零密钥，`dist/` bundle 经核查无密钥残留 |
| 前端安全 | ★★★★☆ | 无 `dangerouslySetInnerHTML`/`eval`，localStorage 只存布局且经 zod 校验 |
| 测试质量 | ★★★★☆ | 13 个测试文件 / 100 个测试全部通过，Worker 路由均有覆盖 |
| **成本防护** | **★☆☆☆☆** | **API 无任何鉴权与限流，公网部署即被白嫖（SEC-01）** |
| 依赖健康度 | ★★☆☆☆ | 26 个已知漏洞，其中 `react-router` 的 High 会随构建产物上线 |
| 代码组织 | ★★☆☆☆ | `assistant-workspace.tsx` 2,413 行、18 个 useState、11 个 useRef |
| 工程化 | ★★☆☆☆ | 无 CI 配置，测试与 typecheck 全靠人工执行 |

### 0.2 本次审计验证过的事实（非推测）

```
npx tsc --noEmit                  → 退出码 0，无类型错误 ✅
npx vitest run                    → 13 文件 / 100 测试 全部通过（4.93s）✅
npx wrangler deploy --dry-run     → ❌ ERROR：DO 未导出，部署失败
git ls-files | wc -l              → 375 个追踪文件，无 node_modules/dist/密钥污染 ✅
```

`.gitignore` 覆盖完善（`node_modules/`、`dist/`、`.wrangler/`、`.dev.vars*`、`.env*`），
`worker-configuration.d.ts`（566KB）**未被追踪**——仓库卫生良好，无需整改。

### 0.3 问题清单总览

| 编号 | 严重度 | 问题 | 位置 |
|---|---|---|---|
| DEPLOY-01 | **Critical** | 未提交的 DO 配置引用未合并分支的代码，部署失败 | `wrangler.toml`（本地改动） |
| SEC-01 | **Critical** | 所有 AI 端点无鉴权无限流，可被刷爆 API 额度 | `src/worker/index.ts` |
| SEC-02 | **High** | 上游错误响应原文（600 字符）直接回传客户端 | `chat/router.ts:372`、`speech:481`、`realtime:112` |
| SEC-03 | **High** | 请求体大小限制可绕过（`content-length` 不可信） | `speech/router.ts:276`、`chat:329`、`realtime:248` |
| ARCH-01 | High | `assistant-workspace.tsx` 2,413 行巨型组件 | `app/modules/assistant/components/` |
| SEC-04 | Medium | 依赖 26 个已知漏洞（2 Critical / 13 High） | `package.json` |
| ARCH-02 | Medium | 四套语音/对话路径并存，主路径不清晰 | `app/modules/assistant/hooks/` |
| ARCH-03 | Medium | 上游 fetch 全部无超时控制 | `chat:120`、`realtime:101`、`speech:98` |
| CONFIG-01 | Medium | 未提交的 provider 配置不应进仓库 | `wrangler.toml` |
| QUAL-01 | Medium | 无 CI，质量门禁全靠人工 | 仓库根目录 |
| SEC-05 | Low | 缺少 CSP | `src/worker/index.ts:14` |

---

## 1. Critical 问题：部署阻断

### DEPLOY-01【Critical】Durable Object 声明但未实现

#### 实证结果

```
$ npx wrangler deploy --dry-run --outdir=/tmp/wrangler_dry

X [ERROR] Your Worker depends on the following Durable Objects,
  which are not exported in your entrypoint file: UpstreamCircuitBreaker.

  You should export these objects from your entrypoint, src\worker\index.ts.
```

**这不是警告，是硬性失败。当前代码库无法部署到 Cloudflare。**

#### 根因：未提交的本地改动引用了未合并分支的代码

这**不是"忘了实现"，而是两处工作没有对齐**。经 git 核验：

**1. DO 配置是未提交的本地改动**

```
$ git status --short wrangler.toml
 M wrangler.toml

$ git diff wrangler.toml
+[[durable_objects.bindings]]
+name = "UPSTREAM_CIRCUIT_BREAKER"
+class_name = "UpstreamCircuitBreaker"
+
+[[migrations]]
+tag = "v1"
+new_sqlite_classes = ["UpstreamCircuitBreaker"]
```

已提交版本**没有**这段配置 —— 也就是说 `git stash` 或 `git checkout wrangler.toml`
就能立刻恢复可部署状态。

**2. 熔断器的完整实现存在于未合并的分支**

```
$ git branch -a | grep resilien
  feat/worker-upstream-resilience
  remotes/origin/feat/worker-upstream-resilience

$ git merge-base --is-ancestor 69a0b86 HEAD
→ 不在 HEAD 上

$ git show --stat 69a0b86
feat: add resilient worker upstream requests
 src/worker/durable-objects/upstream-circuit-breaker.ts    | 133 ++++
 src/worker/durable-objects/upstream-circuit-state.ts      | 194 ++++
 src/worker/durable-objects/upstream-circuit-state.test.ts | 170 ++++
 src/worker/lib/upstream/resilience.ts                     | 368 ++++++
 src/worker/lib/upstream/resilience.test.ts                | 238 ++++
 src/worker/lib/upstream/circuit-client.ts                 | 150 ++++
 src/worker/lib/logger.ts                                  |  28 ++
 src/worker/app.ts                                         |  70 ++
 ...
```

该分支的实现质量相当高，抽查确认：
- `UpstreamCircuitBreaker` 用 **DO SQLite 持久化状态**（`CREATE TABLE circuit_state`），
  而非内存态 —— DO 被驱逐后状态不丢
- 状态机独立成 `upstream-circuit-state.ts`（**纯函数，194 行 + 170 行测试**）
- `resilience.ts` 含**超时控制**（`timeoutMs` + `AbortSignal`）与重试策略

**所以本项目缺的不是代码，是一次 merge。**

#### 修复方案（按推荐顺序）

**方案 A（推荐）：合并已有分支**

```bash
cd E:/competition3

# 1. 先暂存当前 wrangler.toml 的本地改动（含 provider 配置）
git stash push wrangler.toml

# 2. 合并 resilience 分支
git merge feat/worker-upstream-resilience

# 3. 恢复本地 provider 配置（注意：见下方 CONFIG-01，这部分不应提交）
git stash pop

# 4. 验证
npx wrangler deploy --dry-run --outdir=/tmp/wrangler-dry
npx vitest run
```

合并后**一次性解决三个问题**：DEPLOY-01（部署阻断）、
上游调用无超时（见 ARCH-03）、以及缺失的熔断能力。

> 若合并有冲突（`src/worker/index.ts` 在该分支被重构为 57 行 + 新增 `app.ts`），
> 优先保留分支版本的结构，再把当前分支的路由改动叠加上去。

**方案 B（应急）：撤销本地改动**

如果临近提交、不敢做 merge，最小改动是撤销 `wrangler.toml` 中的 DO 配置：

```bash
git checkout wrangler.toml       # 回到已提交状态（无 DO 配置）
# 然后只手工加回需要的 [vars] provider 配置，不要加 DO 段
```

**但要注意**：这样会同时丢掉 `[observability]` 配置，且熔断/超时能力仍然缺失。
只建议在时间极度紧张时采用。

**方案 C（不推荐）：从零实现熔断器**

既然 `feat/worker-upstream-resilience` 已有 1,300+ 行经过测试的实现，
重写没有意义。此处不再展开。

**验收标准**：`npx wrangler deploy --dry-run` 退出码为 0，且 `npx vitest run` 全绿
（该分支自带 408 行熔断器测试）。

---

## 2. Critical 问题：成本攻击

### SEC-01【Critical】AI 端点无鉴权无限流

#### 问题

`src/worker/index.ts` 只挂载了 `secureHeaders()`：

```ts
const app = new Hono<AppEnv>();

app.use("*", secureHeaders());   // ← 只有安全响应头，没有任何访问控制

app.route("/api/chat", chatRoutes);
app.route("/api/provider", providerRoutes);
app.route("/api/realtime", realtimeRoutes);
app.route("/api/speech", speechRoutes);
```

全仓搜索确认，`src/worker/` 下**不存在任何** rate limit、Authorization 校验、CORS 限制：

```
$ grep -rn "rateLimit|Authorization|cors|auth" src/worker/ --include="*.ts" | grep -v test
chat/router.ts:123      Authorization: `Bearer ${apiKey}`,    ← 仅用于调用上游
realtime/router.ts:104  Authorization: `Bearer ${apiKey}`,
speech/router.ts:101    Authorization: `Bearer ${apiKey}`,
（零个入站鉴权命中）
```

#### 攻击场景：成本攻击

Worker 一旦部署到公网（`*.workers.dev` 域名可被扫描发现），任何人都可以：

```bash
# 无限调用你的 LLM 额度
while true; do
  curl -X POST https://your-worker.workers.dev/api/chat/completion \
    -H "Content-Type: application/json" \
    -d '{"message":"写一篇一万字小说","responseBudget":"detailed"}'
done

# 或者刷爆 ASR（每次最大 10MB 音频）
curl -X POST https://your-worker.workers.dev/api/speech/transcription \
  -F "audio=@10mb.wav"

# 或者批量创建 Realtime 会话（每个会话 10 分钟）
curl -X POST https://your-worker.workers.dev/api/realtime/session
```

**后果**：
- SiliconFlow / OpenAI 账单在数小时内被打爆（`detailed` 预算单次 1600 output tokens）
- Cloudflare Workers 免费额度（10 万请求/天）迅速耗尽，正常演示不可用
- Realtime 会话是按时长计费的，批量创建成本尤其高

**这是竞赛项目最容易被现场演示时打爆的问题** —— 一旦评委或其他参赛者拿到你的 Worker 域名。

#### 修复方案：分层防护

**第一层：客户端令牌 + Origin 校验（必须）**

新建 `src/worker/middleware/access-control.ts`：

```ts
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../types";

/**
 * 访问控制中间件。
 *
 * 双重校验：
 *   1. Origin 必须在白名单内（阻断第三方站点直接跨域调用）
 *   2. 携带的客户端令牌必须匹配 Worker secret（阻断 curl 直接调用）
 *
 * 令牌不是真正的用户鉴权（前端代码可见），但足以阻挡自动化扫描与随手复制。
 * 若需要真实用户体系，应改用 Cloudflare Access 或 JWT。
 */
export function accessControl(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const allowedOrigins = (c.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const origin = c.req.header("origin");

    // 有配置白名单时才校验（本地开发可留空）
    if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
      throw new HTTPException(403, { message: "Origin not allowed." });
    }

    const expectedToken = c.env.CLIENT_ACCESS_TOKEN;
    if (expectedToken) {
      const provided = c.req.header("x-client-token");
      if (provided !== expectedToken) {
        throw new HTTPException(401, { message: "Missing or invalid client token." });
      }
    }

    await next();
  };
}
```

**第二层：基于 Durable Object 的限流（必须）**

复用上面的 DO 机制做滑动窗口限流。新建 `src/worker/durable-objects/rate-limiter.ts`：

```ts
import { DurableObject } from "cloudflare:workers";

/** 限流窗口时长。 */
const WINDOW_MS = 60_000;

/** 各端点在一个窗口内的请求上限。 */
const ENDPOINT_LIMITS: Record<string, number> = {
  chat: 20,
  speech: 15,
  realtime: 3,     // Realtime 会话最贵，限制最严
  default: 30,
};

/**
 * 按 IP + 端点维度的滑动窗口限流器。
 *
 * 每个 (IP, endpoint) 组合对应一个 DO 实例。
 */
export class RateLimiter extends DurableObject {
  private timestamps: number[] = [];

  /**
   * 消费一次配额。
   *
   * @param endpoint 端点标识（chat / speech / realtime）
   * @returns 是否允许本次请求，以及需要等待的秒数
   */
  async consume(endpoint: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const now = Date.now();
    const limit = ENDPOINT_LIMITS[endpoint] ?? ENDPOINT_LIMITS.default!;

    // 丢弃窗口外的记录
    this.timestamps = this.timestamps.filter((ts) => now - ts < WINDOW_MS);

    if (this.timestamps.length >= limit) {
      const oldest = this.timestamps[0]!;
      const retryAfterMs = WINDOW_MS - (now - oldest);
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }

    this.timestamps.push(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
```

限流中间件 `src/worker/middleware/rate-limit.ts`：

```ts
import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../types";

/**
 * 限流中间件。
 *
 * 以 CF-Connecting-IP 作为限流键。注意：IP 可被代理池绕过，
 * 因此这是成本控制手段而非严格的安全边界。
 *
 * @param endpoint 端点标识，用于选择配额档位
 */
export function rateLimit(endpoint: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    const id = c.env.RATE_LIMITER.idFromName(`${endpoint}:${ip}`);
    const limiter = c.env.RATE_LIMITER.get(id);

    const { allowed, retryAfterSeconds } = await limiter.consume(endpoint);

    if (!allowed) {
      return c.json(
        {
          success: false,
          error: `请求过于频繁，请 ${retryAfterSeconds} 秒后重试。`,
          code: "rate_limited",
        },
        429,
        { "Retry-After": String(retryAfterSeconds) },
      );
    }

    await next();
  };
}
```

**接线到 `src/worker/index.ts`：**

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { accessControl } from "./middleware/access-control";
import { rateLimit } from "./middleware/rate-limit";
// ... 其余 import

const app = new Hono<AppEnv>();

app.use("*", secureHeaders());

// CORS：只允许配置的来源
app.use("/api/*", async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return cors({
    origin: allowed.length > 0 ? allowed : (origin) => origin,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-Client-Token"],
    maxAge: 86_400,
  })(c, next);
});

// 健康检查与 provider 配置不需要鉴权（无成本）
app.get("/api/health", (c) => { /* ... */ });
app.route("/api/provider", providerRoutes);

// 消耗额度的端点：鉴权 + 限流
app.use("/api/chat/*", accessControl(), rateLimit("chat"));
app.use("/api/speech/*", accessControl(), rateLimit("speech"));
app.use("/api/realtime/*", accessControl(), rateLimit("realtime"));

// body 体积上限（见 SEC-03，必须在路由挂载前）
app.use("/api/speech/*", bodyLimit({ maxSize: 11 * 1024 * 1024 }));
app.use("/api/chat/*", bodyLimit({ maxSize: 9 * 1024 * 1024 }));
app.use("/api/realtime/*", bodyLimit({ maxSize: 64 * 1024 }));

app.route("/api/chat", chatRoutes);
app.route("/api/realtime", realtimeRoutes);
app.route("/api/speech", speechRoutes);

export { UpstreamCircuitBreaker } from "./durable-objects/upstream-circuit-breaker";
export { RateLimiter } from "./durable-objects/rate-limiter";
export default app;
```

**配套 `wrangler.toml` 补充：**

```toml
[[durable_objects.bindings]]
name = "UPSTREAM_CIRCUIT_BREAKER"
class_name = "UpstreamCircuitBreaker"

[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["UpstreamCircuitBreaker", "RateLimiter"]

[vars]
ALLOWED_ORIGINS = "https://your-app.pages.dev,http://localhost:5173"
# CLIENT_ACCESS_TOKEN 用 secret 配置：npx wrangler secret put CLIENT_ACCESS_TOKEN
```

**第三层：预算上限告警（建议）**

在 Cloudflare Dashboard 设置 Workers 用量告警，并在上游供应商（SiliconFlow）
控制台设置月度消费硬上限 —— 这是最后一道防线，代码层面无法替代。

---

### SEC-02【High】上游错误原文直接回传客户端

#### 问题（已实测确认）

`src/worker/routes/chat/router.ts:372-382`：

```ts
function getUpstreamErrorMessage(body: UpstreamResponseBody): string | undefined {
  const structuredMessage = getStructuredUpstreamErrorMessage(body.value);
  if (structuredMessage !== undefined) {
    return structuredMessage;
  }
  return body.textSnippet === null
    ? undefined
    : `Provider returned ${body.textSnippet}`;   // ← 上游响应体原文直接进客户端响应
}
```

`createTextSnippet`（`chat/router.ts:358-370`）只做空白折叠与 600 字符截断，
**不做任何内容过滤**，随后原样放入 502 响应体返回给浏览器。

同样的代码在三处重复：
- `src/worker/routes/chat/router.ts:372-382`
- `src/worker/routes/speech/router.ts:481-491`（与 chat 逐字相同）
- `src/worker/routes/realtime/router.ts:112-122`

**仓库测试还把这个行为固化成了断言**（`chat/router.test.ts:494`）：

```ts
expect(body.error).toBe("Provider returned bad request: unsupported max_tokens");
```

#### 风险

上游 4xx/5xx 响应体常包含内部主机名、请求 ID、账户/组织 ID、配额详情；
部分 API 网关在报错时会回显请求头 —— 600 字符窗口足以带出完整的
`Authorization: Bearer sk-...`。

攻击者只需发送畸形请求主动触发上游报错，即可指纹识别你使用的供应商
（本项目为 `api.siliconflow.cn`）与当前配额状态。

#### 修复

```ts
/**
 * 生成对客户端安全的上游错误响应。
 *
 * 原文只写入 Workers 日志供排查；客户端仅拿到状态码与错误码，
 * 避免上游响应体中的内部信息（主机名、请求 ID、回显的凭据）外泄。
 */
function createSafeUpstreamError(
  status: number,
  snippet: string | null,
  env: CloudflareBindings,
): ChatApiErrorResponse {
  console.error("upstream_error", { status, snippet });

  // 非生产环境保留原文，便于本地调试
  if (env.ENVIRONMENT !== "production") {
    return {
      success: false,
      error: snippet ?? `Upstream returned ${status}.`,
      code: "chat_completion_failed",
    };
  }

  const message =
    status === 401 || status === 403
      ? "服务配置有误，请联系管理员。"
      : status === 429
        ? "上游服务繁忙，请稍后重试。"
        : "AI 服务暂时不可用，请稍后重试。";

  return { success: false, error: message, code: "chat_completion_failed" };
}
```

前端 `use-chat-completion.ts:64-66` 已经按 `code` 做本地化展示，
只需删掉对 `errorResponse.error` 的插值即可，用户体验不受影响。

同时需要更新 `chat/router.test.ts:494` 等断言 —— 让测试验证"不泄露原文"，
而不是固化泄露行为。

---

### SEC-03【High】请求体大小限制可绕过

> **这一条修正了本方案早期版本的判断。** zod schema 层面的上限（4000 字符 message /
> 8MB imageDataUrl / 10MB 音频 / 11 项 MIME 白名单）确实严谨，
> 但**整体请求体的读取没有保护**。

#### 问题

`src/worker/routes/speech/router.ts:276-290` 的前置检查依赖客户端头部：

```ts
const contentLength = Number(c.req.header("content-length") ?? "0");

if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_UPLOAD_BYTES) {
  return { success: false, status: 413, /* ... */ };
}
```

**三条绕过路径：**

1. **省略 `content-length` 头** → `?? "0"` → `0 > 11_000_000` 为假 → 直接通过
2. **`Transfer-Encoding: chunked`** → 本就没有 `content-length`
3. **伪报一个小值** → 头部完全由客户端控制，服务端未校验实际读取量

绕过后，第 308 行 `await c.req.formData()` **不带任何上限读取整个 body 进内存**。
真正的 10MB 校验在第 361 行 `audioValue.size > MAX_AUDIO_UPLOAD_BYTES` ——
**此时超大 body 已经完整驻留内存了**。

`chat/router.ts:329` 与 `realtime/router.ts:248` 的 `await c.req.json()`
**连前置检查都没有**。

Cloudflare Workers 单 isolate 内存上限为 128MB，
并发的大 body 请求足以打爆 isolate 触发 `Error 1102`。

#### 修复

用 Hono 自带的 `bodyLimit` 中间件（`hono@4.12.25` 已包含）。
它在**流层面**截断，不信任客户端头部：

```ts
import { bodyLimit } from "hono/body-limit";

app.use("/api/speech/*", bodyLimit({
  maxSize: 11 * 1024 * 1024,
  onError: (c) => c.json({ success: false, error: "上传内容过大。", code: "payload_too_large" }, 413),
}));
app.use("/api/chat/*", bodyLimit({ maxSize: 9 * 1024 * 1024 }));
app.use("/api/realtime/*", bodyLimit({ maxSize: 64 * 1024 }));
```

同时**删除** `speech/router.ts:276-290` 的 `content-length` 检查 ——
它现在只提供虚假的安全感，保留反而会误导后续维护者以为已有防护。

---

### SEC-04【Medium】依赖存在 26 个已知漏洞

`pnpm audit` 实测结果：**2 Critical / 13 High / 8 Moderate / 3 Low**。

| 依赖 | 版本 | 等级 | 问题 | 是否影响线上 |
|---|---|---|---|---|
| `vitest` | 3.0.0（精确锁死） | **Critical ×2** | API server RCE（需 ≥3.0.5）、UI server 任意文件读取（需 ≥3.2.6） | 否，仅开发机 |
| `react-router` | 7.17.0 | **High ×2** | 未认证 DoS（低效路由匹配，需 ≥7.18.0）、RSC CSRF 绕过 | **是，随 dist/ 上线** |
| `hono` | 4.12.25 | Moderate ×3 | `hono/jsx` 跨请求数据泄露、`cx()` JSX 转义绕过（需 ≥4.12.27） | 是 |
| `esbuild` / `undici` / `postcss` / `ws` 等 | 传递依赖 | High/Low | 经由 `wrangler`、`vite` 引入 | 部分 |

> `zod` 固定在 4.0.0 —— 经核查**无已知 CVE**，这个锁定没有问题。
> 全部依赖许可证为 MIT 或 MIT-OR-Apache-2.0，无传染性风险。

**修复：**

```bash
# vitest 是精确版本锁死，pnpm update 不会自动升，必须显式改 package.json
pnpm add -D vitest@^3.2.6

# react-router 影响线上，优先级最高
pnpm add react-router@^7.18.0

pnpm add hono@^4.12.27
pnpm update            # 传递依赖
pnpm audit             # 确认剩余项
```

升级后务必重跑 `pnpm test`（vitest 大版本内升级偶有 API 变动）。

---

### CONFIG-01【Medium】未提交的 provider 配置不应进仓库

`wrangler.toml` 的本地改动中，`[vars]` 段硬编码了供应商指纹：

```toml
OPENAI_BASE_URL = "https://api.siliconflow.cn/v1"
OPENAI_CHAT_MODEL = "nex-agi/Nex-N2-Pro"
OPENAI_TRANSCRIPTION_MODEL = "TeleAI/TeleSpeechASR"
```

**密钥本身是干净的**（`OPENAI_API_KEY` 不在 `[vars]` 中，
全仓 `git grep` 无密钥，`dist/` bundle 中 4 处 `OPENAI_API_KEY`
经核对全部是错误提示文案而非真实值）—— 这点做得对。

但项目自己的开发笔记写明：

> "Local-only provider configuration changes must remain outside roadmap commits"
> （`.trellis/tasks/archive/2026-07/07-15-technical-upgrade-roadmap/notes.md:31`）

建议提交前 `git checkout wrangler.toml` 或用 `wrangler secret` 管理，
避免把个人的供应商选择与配额信息固化进仓库。

---

### SEC-05【Low】缺少 CSP

`src/worker/index.ts:14` 的 `secureHeaders()` 使用默认配置，
经核查（`hono/dist/middleware/secure-headers/secure-headers.js:17-32`）
**默认不包含 `Content-Security-Policy`**。

当前前端无可利用的 XSS 面（见下方 4.3），所以只算 Low。
但项目使用 `getUserMedia` 访问摄像头与麦克风，值得补一层：

```ts
app.use("*", secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],   // Tailwind 运行时需要
    imgSrc: ["'self'", "data:", "blob:"],       // 摄像头帧
    mediaSrc: ["'self'", "blob:"],
    connectSrc: ["'self'", "https://api.openai.com", "wss://api.openai.com"],
    frameAncestors: ["'none'"],
  },
}));
```
---

## 3. 架构改造

### ARCH-01【High】巨型组件拆分

#### 现状

```
app/modules/assistant/components/assistant-workspace.tsx
  行数：2,413
  useState：18 个
  useRef：11 个
  useCallback：16 个
  useEffect：7 个
```

单个组件承载了：媒体权限、摄像头预览、帧采样与差分、Realtime 会话、
Chat Completions、语音转写、连续对话 VAD、用量计费、布局工具栏、
转写列表、文本输入、下载导出 —— **12 个以上的独立关注点**。

违反项目规范中的"单文件 200–400 行"原则达 6 倍。

**实际影响**：
- 任何一个 state 变化都会重渲染整棵子树（18 个 useState 集中在顶层）
- 7 个 useEffect 的依赖数组互相牵连，改动极易引入无限循环
- 无法为单个功能写单元测试（当前 `components/` 下零测试文件，
  而 `lib/` 下每个模块都有测试 —— 正说明巨型组件不可测）

#### 目标架构

```
app/modules/assistant/
├── components/
│   ├── assistant-workspace.tsx          # 编排层，≤200 行，只组合不实现
│   ├── media/
│   │   ├── camera-preview.tsx           # 摄像头预览 + 权限提示
│   │   └── frame-sampling-panel.tsx     # 采样控制 + 差分计数展示
│   ├── session/
│   │   ├── realtime-controls.tsx        # Realtime 启停 / VAD / 静音
│   │   └── chat-controls.tsx            # Chat 模式控制
│   ├── conversation/
│   │   ├── transcript-list.tsx          # 已存在，保留
│   │   └── message-composer.tsx         # 文本输入 + 语音输入
│   └── usage/
│       └── usage-meter.tsx              # 用量与成本展示
├── hooks/
│   ├── use-assistant-session.ts         # 统一会话编排（见 ARCH-02）
│   ├── use-continuous-chat-vad.ts       # 从巨型组件抽出的 VAD 逻辑
│   └── ...（现有 hooks）
└── state/
    └── assistant-store.ts               # 集中状态（useReducer 或 zustand）
```

#### 拆分步骤（增量、每步可运行）

1. **先抽纯函数**：`getAudioContextConstructor`、`calculateAudioRootMeanSquare`、
   `buildDownloadDataUrl`、`downloadTextFile`（位于文件 222–278 行）
   移到 `lib/audio-utils.ts` 与 `lib/download.ts`，**并补单元测试**。
   这一步零风险，且立刻增加可测代码占比。

2. **抽出连续对话 VAD**：文件 210–215 行的 6 个常量
   （`CONTINUOUS_CHAT_*`）连同相关 state 与 effect 抽成
   `use-continuous-chat-vad.ts`，接口设计为：

   ```ts
   type ContinuousChatVadOptions = {
     enabled: boolean;
     onUtteranceComplete: (audio: Blob) => void;
   };

   type ContinuousChatVadResult = {
     isRecording: boolean;
     audioLevel: number;
     start: () => void;
     stop: () => void;
   };

   export function useContinuousChatVad(
     options: ContinuousChatVadOptions,
   ): ContinuousChatVadResult;
   ```

3. **状态收敛到 reducer**：18 个 useState 中，会话相关的
   （`assistantPhase`、`transcript`、`sampledFrameCount`、`sentFrameCount`、
   `skippedAutoFrameCount`）强相关，合并为单个 `useReducer`：

   ```ts
   type AssistantState = {
     phase: AssistantPhase;
     transcript: readonly TranscriptEntry[];
     frameStats: {
       sampled: number;
       sent: number;
       skippedAuto: number;
     };
     lastFrameDataUrl: string | null;
   };

   type AssistantAction =
     | { type: "session-started" }
     | { type: "session-stopped" }
     | { type: "transcript-appended"; entry: TranscriptEntry }
     | { type: "frame-sampled"; dataUrl: string; sent: boolean }
     | { type: "frames-pruned"; removedCount: number };

   function assistantReducer(state: AssistantState, action: AssistantAction): AssistantState {
     switch (action.type) {
       case "frame-sampled":
         return {
           ...state,
           lastFrameDataUrl: action.dataUrl,
           frameStats: {
             sampled: state.frameStats.sampled + 1,
             sent: state.frameStats.sent + (action.sent ? 1 : 0),
             skippedAuto: state.frameStats.skippedAuto + (action.sent ? 0 : 1),
           },
         };
       // ...
     }
   }
   ```

   reducer 是纯函数，**可以直接写单元测试** —— 这是把不可测代码变成可测代码的关键一步。

4. **拆 UI 子组件**：按上面的目录结构逐个搬迁，每搬一个跑一次
   `pnpm typecheck && pnpm test` 确认无回归。

---

### ARCH-02【Medium】四套对话路径并存

#### 现状

`app/modules/assistant/hooks/` 下并存四套路径：

| Hook | 行数 | 职责 |
|---|---|---|
| `use-realtime-session.ts` | 1,100 | WebRTC Realtime 会话 |
| `use-chat-completion.ts` | 165 | Chat Completions 模式 |
| `use-worker-speech-transcription.ts` | 480 | Worker 侧 ASR |
| `use-browser-speech-adapter.ts` | 363 | 浏览器原生语音 API |

README 说明 Chat Completions 是"给不支持 Realtime 的第三方 API 站点"的兼容模式。
但 `wrangler.toml` 中 `OPENAI_PROVIDER_MODE = "chat"` 且
`OPENAI_CHAT_VISION_INPUT = "disabled"` —— **默认配置下走的是 Chat 模式且视觉输入关闭**。

这意味着一个名为"AI **视觉**对话助手"的项目，**默认配置下视觉能力是关闭的**。

#### 问题

1. 评委按默认配置运行，看不到项目的核心卖点（视觉理解）
2. 四套路径的状态可能相互干扰（如 Realtime 会话未关闭时切到 Chat 模式）
3. 维护成本高，任何协议变更要改四处

#### 改造建议

**第一步（立即）：修正默认配置**

当前默认走 SiliconFlow 的 `nex-agi/Nex-N2-Pro` 且视觉关闭。
若该模型确实不支持视觉，应在 README 中**明确标注**"默认演示配置不含视觉能力，
体验完整功能需配置支持 vision 的模型"，并给出推荐配置：

```toml
[vars]
OPENAI_PROVIDER_MODE = "chat"
OPENAI_CHAT_MODEL = "Qwen/Qwen2.5-VL-72B-Instruct"   # 支持视觉的模型
OPENAI_CHAT_VISION_INPUT = "enabled"
```

**第二步：统一会话编排层**

新建 `hooks/use-assistant-session.ts` 作为唯一对外接口，
内部根据 provider mode 选择实现，并保证模式切换时正确清理上一路径：

```ts
export type AssistantSessionMode = "realtime" | "chat";

export type AssistantSession = {
  mode: AssistantSessionMode;
  status: "idle" | "connecting" | "active" | "error";
  start: () => Promise<void>;
  stop: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
  sendFrame: (dataUrl: string) => Promise<void>;
};

/**
 * 统一的助手会话编排。
 *
 * 屏蔽 Realtime / Chat Completions 两套底层实现的差异，
 * 并保证模式切换时前一会话被完整清理（避免 WebRTC 连接泄漏）。
 */
export function useAssistantSession(mode: AssistantSessionMode): AssistantSession {
  const realtime = useRealtimeSession();
  const chat = useChatCompletion();

  // 模式切换时清理旧会话
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current !== mode) {
      if (previousMode.current === "realtime") {
        void realtime.stop();
      } else {
        void chat.reset();
      }
      previousMode.current = mode;
    }
  }, [mode, realtime, chat]);

  return mode === "realtime"
    ? { mode, status: realtime.status, /* ... */ }
    : { mode, status: chat.status, /* ... */ };
}
```

---

### ARCH-03【Medium】上游 fetch 全部无超时控制

经 grep 确认，`src/worker/`（排除测试）中 `AbortSignal` 与 `timeout` **零命中**。
三处上游调用都是裸 `fetch`：

- `src/worker/routes/chat/router.ts:120`
- `src/worker/routes/realtime/router.ts:101`
- `src/worker/routes/speech/router.ts:98`

上游卡住时，Worker 请求会一直挂到 Cloudflare 的硬性限制才终止，
期间占用 isolate 资源，用户侧则表现为无限等待。

**修复**：这正是 DEPLOY-01 的连带后果 —— 超时、重试、取消逻辑
**已经完整实现在 `feat/worker-upstream-resilience` 分支**
（`src/worker/lib/upstream/resilience.ts`，368 行 + 238 行测试，
含 `timeoutMs` 与 `AbortSignal` 支持）。

按 DEPLOY-01 的方案 A 合并该分支，**本条随之解决**，无需单独开发。

若暂不合并，最小补丁：

```ts
const upstreamResponse = await fetch(providerConfig.completionsUrl, {
  method: "POST",
  headers: { /* ... */ },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30_000),   // Chat 30s；Realtime session 10s 足够
});
```

---

## 4. 工程化补强

### QUAL-01 缺少 CI

项目无 `.github/` 目录，`pnpm typecheck`、`pnpm test`、`pnpm lint` 全靠人工执行。

新建 `.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: 安装依赖
        run: pnpm install --frozen-lockfile

      - name: 类型检查
        run: pnpm typecheck

      - name: 代码风格
        run: pnpm lint

      - name: 单元测试
        run: pnpm test

      - name: 构建
        run: pnpm build

      # 关键：防止 DEPLOY-01 类问题再次发生
      - name: 部署配置校验
        run: npx wrangler deploy --dry-run --outdir=/tmp/wrangler-dry
```

> **最后一步尤为重要**：正是因为没有这道门禁，`wrangler.toml` 里
> 声明了不存在的 Durable Object 才能一直留在仓库里。

---

## 5. 实施路线图

### 阶段一：恢复可部署 + 止血（半天，最高优先级）

| 顺序 | 任务 | 验收标准 |
|---|---|---|
| 1 | **DEPLOY-01 合并 `feat/worker-upstream-resilience`** | `wrangler deploy --dry-run` 退出码 0；顺带解决 ARCH-03 |
| 2 | SEC-01 接入限流 + 访问令牌 | 未带令牌的 curl 返回 401；超频返回 429 |
| 3 | SEC-03 接入 `bodyLimit` 并删除失效检查 | 无 `content-length` 的超大 body 被 413 拒绝 |
| 4 | SEC-02 错误响应脱敏（三处） | 生产环境不回传上游原文；更新对应测试断言 |
| 5 | SEC-04 升级 `react-router` / `vitest` / `hono` | `pnpm audit` 无 Critical/High |
| 6 | 上游供应商侧设置消费硬上限 | 控制台已配置 |
| 7 | QUAL-01 建立 CI（含部署干跑） | PR 触发全部检查通过 |

### 阶段二：架构重构（3–5 天）

| 顺序 | 任务 | 验收标准 |
|---|---|---|
| 5 | ARCH-01 步骤 1–2（抽纯函数 + VAD hook） | 新增模块均有单测，主组件 ≤1,800 行 |
| 6 | ARCH-01 步骤 3（reducer 收敛） | reducer 单测覆盖全部 action |
| 7 | ARCH-01 步骤 4（UI 拆分） | 主组件 ≤200 行，各子组件 ≤300 行 |
| 8 | ARCH-02 统一会话编排 | 模式切换无连接泄漏（DevTools 验证） |

### 阶段三：打磨（1–2 天）

| 顺序 | 任务 |
|---|---|
| 9 | SEC-02 错误响应脱敏 |
| 10 | 默认配置改为支持视觉的模型，README 同步 |
| 11 | 补 `components/` 的组件测试（当前为零） |

---

## 6. 竞赛答辩建议

### 6.1 必须在演示前完成的事

**如果只有一小时准备时间，只做两件事：**

1. 修复 DEPLOY-01 —— 否则**根本无法部署演示**
2. 接入 SEC-01 的限流 —— 否则演示当天 Worker 域名一旦暴露，额度可能被打爆

### 6.2 应当主动强调的亮点

1. **零密钥前端架构**：所有 AI 供应商密钥仅存在于 Worker 侧，
   前端通过 `/api/provider/config` 只拿到非敏感的模式标识。
   审计中核查了 `dist/` 构建产物 —— 其中 4 处 `OPENAI_API_KEY` 全部是错误提示文案，
   无任何密钥残留。这是很多同类项目做错的地方（把 key 放 localStorage），值得强调。
2. **前端 XSS 面干净**（经全仓核查）：
   - `dangerouslySetInnerHTML` / `innerHTML` / `eval(` / `new Function` **零命中**
   - 转写内容走 React 自动转义（`transcript-list.tsx:223`）
   - `localStorage` 仅 2 处，只存 UI 布局，且读取时经 zod 校验 + try/catch
   - 生产代码 `console.*` 零命中，摄像头帧不进日志
3. **无 SSRF 风险**（经核查）：三个路由的上游 URL 全部来自 `c.env.*`，
   zod schema 中没有任何 url/baseUrl/endpoint 字段，
   `c.req.query` / `c.req.param` 在 `src/worker/` 零命中 ——
   客户端无法把 Worker 指向任意地址。
4. **帧差分 + 对话历史剪枝的成本优化**：`frame-diff.ts` 与 `frame-pruning.ts`
   是真实的工程创新 —— 静态场景不重复上传、已消费的帧从历史中删除避免重复计费。
   建议用**具体数字**展示节省效果（如"静态场景下上传量降低 85%"）。
5. **100 个单元测试全部通过**，Worker 四个路由均有覆盖。
6. **熔断器实现质量高**（合并后可讲）：DO SQLite 持久化状态而非内存态、
   状态机抽离为纯函数（194 行 + 170 行测试）、含超时与重试策略。

### 6.3 需要预先准备回答的质疑

| 评委可能问 | 建议回答方向 |
|---|---|
| "部署到公网谁都能用，你的 API 费用怎么办？" | 展示已实现的三层防护：Origin 校验 + 客户端令牌 + DO 滑动窗口限流，并说明上游已设消费硬上限 |
| "为什么叫视觉助手但默认视觉是关的？" | 坦白说明是为兼容不支持 vision 的第三方 API 站点，并现场切换到 vision 配置演示 |
| "2400 行的组件是不是太大了？" | 主动承认并展示已规划/已完成的拆分方案，说明 `lib/` 层已做到纯函数 + 全测试覆盖 |
| "熔断器是干什么的？" | 若采用方案 B，这反而成为加分项：讲 DO 单实例状态 + 三态转换 + 只对 5xx 计失败的设计考量 |

---

## 附录 A：本次审计的验证命令

```bash
cd E:/competition3

npx tsc --noEmit                                  # → 退出码 0 ✅
npx vitest run                                    # → 13 文件 / 100 测试通过 ✅
npx wrangler deploy --dry-run --outdir=/tmp/dry   # → ❌ DO 未导出，部署失败
npx pnpm audit                                    # → 26 个漏洞（2 Critical / 13 High）
git ls-files | wc -l                              # → 375（无污染）✅
git status --short wrangler.toml                  # → M（DO 配置是未提交改动）
git merge-base --is-ancestor 69a0b86 HEAD         # → 不在 HEAD 上
git show --stat 69a0b86                           # → 熔断器完整实现在该 commit
wc -l app/modules/assistant/components/assistant-workspace.tsx  # → 2413
grep -rn "dangerouslySetInnerHTML\|eval(" app/ src/            # → 零命中 ✅
```

---

## 附录 B：与早期版本的差异说明

本方案在完成初稿后经过一轮交叉复核，修正了两处判断：

1. **DEPLOY-01 的性质**：初稿判断为"规划后未实施的配置残留"，
   建议从零实现熔断器。经 git 核查后确认，实现**已存在于未合并分支**
   （1,300+ 行含测试），正确做法是合并而非重写。

2. **输入校验评级**：初稿认为"大小上限做得扎实"（★★★★☆）。
   经复核，zod 层面确实严谨，但**请求体整体读取无保护且前置检查可绕过**
   （SEC-03），已下调为 ★★★☆☆ 并新增该条目。

保留此记录是为了说明：安全审计中"看起来有防护"与"防护实际有效"是两件事，
`content-length` 检查正是典型的**虚假安全感**案例。

---

*本方案基于 2026-08-01 的代码状态。DEPLOY-01 经 `wrangler --dry-run` 实际复现，
测试与类型检查结果均为实际执行所得，未包含推测性结论。*
