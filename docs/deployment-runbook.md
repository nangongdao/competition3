# 部署与监控 Runbook

> AI 视觉对话助手（competition3）从零部署到生产环境的操作手册，
> 覆盖 Wrangler 部署、D1 迁移、DO 绑定、secret 管理、回滚与监控告警。
>
> 依据 `docs/upgrade-roadmap.md` M5.3 落地。目标：**按本文档可从零部署到生产；回滚步骤可执行。**

---

## 1. 部署架构总览

| 资源 | 用途 | 位置 |
|---|---|---|
| **Worker** | 后端 API（Chat/Realtime/Speech/Sessions/Provider），托管静态前端 | `src/worker/`，入口 `src/worker/index.ts` |
| **Durable Objects** | 滑动窗口限流（`RateLimiter`）、上游熔断器（`UpstreamCircuitBreaker`） | `src/worker/durable-objects/` |
| **D1 数据库** | 会话/消息/帧/场景记忆持久化（`SESSIONS_DB`） | `migrations/` + `src/worker/lib/db/` |
| **静态资源** | 前端构建产物，由 Worker 的 `assets` binding 托管（SPA） | `dist/`（`pnpm build` 生成） |
| **环境变量** | `OPENAI_API_KEY`、`OPENAI_CHAT_MODEL` 等 | Worker `vars` / secrets |
| **上游 AI 供应商** | OpenAI / OpenAI 兼容 Chat 提供商 | 配置在 Worker `vars` |

---

## 2. 前置条件

- 已安装 [Node.js ≥22](https://nodejs.org/) 与 `pnpm`（`corepack enable` 后 `pnpm --version` 可用）。
- 已登录 Cloudflare：`npx wrangler login`（浏览器 OAuth），或配置 `CLOUDFLARE_API_TOKEN`。
- 已确认目标 Cloudflare 账号具备 Workers / D1 / Durable Objects 权限。

本地开发依赖 `.env`：

```bash
cp .env.example .env
# 填写 VITE_CLIENT_ACCESS_TOKEN（与 Worker secret CLIENT_ACCESS_TOKEN 一致；本地可留空跳过令牌校验）
```

---

## 3. 本地验证（部署前必须通过）

```bash
pnpm install
npx wrangler types                    # 生成 worker-configuration.d.ts（prepare 会自动跑，此处显式兜底）
pnpm typecheck                        # 类型检查
pnpm lint                             # 代码风格（0 警告）
pnpm test                             # 单元 + Worker 测试
pnpm build                            # 生产构建（产出 dist/）
npx wrangler deploy --dry-run         # 部署配置校验（退出码 0）
```

> CI（`.github/workflows/ci.yml`）在每次 push/PR 自动执行以上门禁。合并到 `main` 前必须全绿。

本地运行 Worker + 前端：

```bash
pnpm dev                             # 前端 dev server（Vite，默认 5173）
pnpm dev:worker                      # 先 build，再用 wrangler dev 启动 Worker
```

---

## 4. 首次部署（从零到生产）

### 4.1 创建 D1 数据库

```bash
# 创建 D1 数据库，得到真实 UUID
npx wrangler d1 create ai-visual-dialogue-sessions
```

把输出的 `database_id` 回填到 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "SESSIONS_DB"
database_name = "ai-visual-dialogue-sessions"
database_id = "<真实 UUID>"
migrations_dir = "migrations"
```

### 4.2 本地应用迁移（幂等验证）

```bash
# 本地 D1 模拟验证迁移脚本幂等（二次执行无变更）
npx wrangler d1 migrations apply ai-visual-dialogue-sessions --local
npx wrangler d1 migrations apply ai-visual-dialogue-sessions --local   # 再次执行应无变更
```

### 4.3 配置 secrets 与环境变量

Worker 所需的敏感值通过 `wrangler secret put` 设置（不落入仓库）：

```bash
npx wrangler secret put OPENAI_API_KEY                      # 上游 AI 供应商 API Key（必需）
npx wrangler secret put CLIENT_ACCESS_TOKEN                 # 前端访问令牌（建议生产必设）
npx wrangler secret put OPENAI_TRANSCRIPTION_API_KEY        # 可选：语音转写独立 Key，缺省回退 OPENAI_API_KEY
```

非敏感配置写在 `wrangler.toml` 的 `[vars]`（已含占位，按需覆盖）：

```toml
[vars]
ENVIRONMENT = "production"
OPENAI_PROVIDER_MODE = "chat"            # chat | realtime
OPENAI_CHAT_MODEL = "gpt-4o-mini"        # Chat 模式使用的模型
ALLOWED_ORIGINS = "https://your-domain.example.com"   # 生产 CORS 白名单（必改！）
```

> ⚠️ `ALLOWED_ORIGINS` 必须包含生产前端域名，否则浏览器跨域请求被拒。
> `CLIENT_ACCESS_TOKEN` 若不设置，Worker 将跳过令牌校验——**生产必须设置**。

### 4.4 部署 Worker

```bash
npx wrangler deploy
```

部署成功后 Worker 同时托管前端静态资源（`assets` binding 指向 `dist/`）。

---

## 5. 常规升级部署

```bash
pnpm install
pnpm test && pnpm build
npx wrangler deploy --dry-run          # 预检
npx wrangler deploy                    # 正式发布
```

### D1 迁移（schema 变更时）

新增迁移脚本放入 `migrations/`，命名 `0001_xxx.sql`、`0002_xxx.sql`…（递增）。

```bash
# 本地先验证
npx wrangler d1 migrations apply ai-visual-dialogue-sessions --local
# 生产应用
npx wrangler d1 migrations apply ai-visual-dialogue-sessions --remote
```

> 所有迁移脚本**必须幂等**（建表/索引带 `IF NOT EXISTS`），允许重复执行，见 `migrations/0000_init.sql`。

---

## 6. 公开部署与持续发布（CI/CD 收尾）

> 本节为 runbook 收尾：把 `main` 上的发布流程自动化，使每次合并都可直接**公开部署**到
> Cloudflare Workers 的 `workers.dev` 公共地址（或配置的自定义域名），避免人工手敲 `wrangler` 命令。

### 6.1 自动化部署流水线（`.github/workflows/deploy.yml`）

仓库内置 `deploy.yml`：在 `main`/`master` 的 push 或手动 `workflow_dispatch` 触发，自动执行：

```yaml
trigger: push → main/master  |  workflow_dispatch（手动）
steps:
  1. pnpm install + wrangler types
  2. typecheck + 单测 + 生产构建
  3. wrangler deploy --dry-run（配置预检，非 0 即中止）
  4. d1 migrations apply --remote（生产 schema 迁移）
  5. 写入生产 secrets（OPENAI_API_KEY / CLIENT_ACCESS_TOKEN）
  6. wrangler deploy（发布到公开地址）
```

**首次启用前，在仓库 Secrets 配置**：

| Secret | 用途 | 必需 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（Workers / D1 / DO 写权限） | ✅ |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID（可选，wrangler 可推断） | 可选 |
| `OPENAI_API_KEY` | 上游 AI 供应商 Key，部署时写入 Worker secret | ✅ |
| `CLIENT_ACCESS_TOKEN` | 生产访问令牌，部署时写入 Worker secret | ✅（生产必设） |

> 注意：`wrangler deploy` 需要 Cloudflare 账号已创建 D1 数据库并把 `database_id` 回填到
> `wrangler.toml`（见 4.1），否则迁移/部署会因占位 UUID 失败。

### 6.2 公开访问地址

- **默认**：部署后即可通过 `https://ai-visual-dialogue-assistant.<账号子域>.workers.dev` 访问。
  `wrangler deploy` 末尾会打印实际的 `workers.dev` URL。
- **自定义域名**（生产建议）：在 Cloudflare 控制台将域名 DNS 接入后，绑定路由：

  ```bash
  npx wrangler routes list
  npx wrangler routes add --pattern "your-domain.example.com/*" your-worker-name
  ```

  或在 `wrangler.toml` 声明 `routes`（需域名已由 Cloudflare 托管）。

### 6.3 公开部署上线检查清单（Go-Live）

1. D1 已创建且 `database_id` 回填到 `wrangler.toml`（非占位 UUID）。
2. `CLOUDFLARE_API_TOKEN` / `OPENAI_API_KEY` / `CLIENT_ACCESS_TOKEN` 已在仓库 Secrets 配置。
3. 手动 `workflow_dispatch` 触发一次部署，确认 job 全绿。
4. 打开 `wrangler deploy` 输出的 `workers.dev` 地址，验证：
   - 页面正常加载（静态前端由 Worker 的 `assets` 托管）；
   - `GET /api/health` 返回 `200`；
   - 未带 `CLIENT_ACCESS_TOKEN` 的请求被令牌校验拦截（若已设置）；
   - 摄像头/Chat/Realtime 主路径可用（与 `docs/demo-verification.md` 一致）。
5. 若用自定义域名，确认 `ALLOWED_ORIGINS` 已包含该域名（见 4.3），浏览器跨域不被拒。

---

## 7. 回滚步骤

### 7.1 Worker 代码回滚

回滚 Worker 到上一个可发布版本，同时**保留 D1/DO binding 与 migrations 状态**（绑定在 `wrangler.toml` 中声明，回滚旧代码不删除 binding）：

```bash
# 查看已部署的发布版本（每个 deploy 生成一个 deployment id）
npx wrangler deployments list

# 回滚到指定 deployment（保留 binding、env、迁移后的 D1 schema）
npx wrangler rollback <deployment-id>
```

### 7.2 D1 数据回滚（迁移误操作）

> D1 迁移脚本设计为**向前推进**（幂等 + 累积）。数据回滚需在迁移前导出备份。

- **迁移前备份**：用 `wrangler d1 export` 导出数据库快照，存档到安全位置：

  ```bash
  npx wrangler d1 export ai-visual-dialogue-sessions --remote --output=./backup-$(date +%F).sql
  ```

- **回滚**：若迁移导致数据异常，从备份重建：

  ```bash
  npx wrangler d1 execute ai-visual-dialogue-sessions --remote --file=./backup-<date>.sql
  ```

- **DO 迁移回滚**：DO 的 `[[migrations]]`（`wrangler.toml`）采用 `new_sqlite_classes` 标签推进。回滚部署旧 Worker 版本并保留 DO binding 即可，SQLite DO 状态由 Cloudflare 管理，无需手动回退迁移标签。

### 7.3 快速回滚清单

1. 确认当前 deployment id：`npx wrangler deployments list`
2. 备份 D1（若涉及数据）：`npx wrangler d1 export ...`
3. 回滚：`npx wrangler rollback <deployment-id>`
4. 验证：访问生产域名，确认 API 与页面正常。

---

## 8. 监控与告警

### 8.1 Cloudflare 侧

- **Observability**：`wrangler.toml` 已启用 `[observability]`（`head_sampling_rate = 1`），可在 Cloudflare 控制台查看请求日志、异常、性能。
- **用量告警**：在 Cloudflare 控制台为 Worker 设置：
  - **请求次数 / 带宽**用量告警（接近免费额度或账单阈值时通知）。
  - **错误率**告警（5xx 率上升时触发）。

### 8.2 上游 AI 供应商消费硬上限

防止上游 API 消费失控，必须设置：

- **OpenAI**：Account → Limits → **设置每月消费硬上限**（Hard Limit），并在接近时告警。
- **Cloudflare D1 / Workers**：设置**用量预算**（Budget），超出即暂停或告警。
- **应用层成本护栏**：本项目已内置
  - DO 滑动窗口限流（Chat 20/min、Speech 15/min、Realtime 3/min，见 `rate-limiter.ts`）
  - 请求体上限（`bodyLimit` 截断）
  - 帧差分/剪枝/场景记忆降本（`frame-diff.ts`、`frame-pruning.ts`、`scene-memory.ts`）
  - 上游熔断器（`upstream-circuit-breaker.ts`）防雪崩

建议结合上游供应商的消费报告，定期核对应用内 `UsagePanel` 展示的成本，确认与账单一致。

### 8.3 熔断器健康端点（只读监控）

`GET /api/circuit` 暴露上游熔断器的只读健康快照，供监控/告警轮询：

```json
{
  "success": true,
  "timestamp": 1724137368000,
  "openShardCount": 1,
  "shards": [
    {
      "name": "https://api.openai.com|chat",
      "origin": "https://api.openai.com",
      "operation": "chat",
      "state": {
        "mode": "open",
        "consecutiveFailures": 3,
        "openUntil": 1724137388000,
        "generation": 1,
        "probeInFlight": false,
        "isOpen": true,
        "retryAfterMs": 20000
      }
    }
  ]
}
```

- 该端点**只读**：Durable Object 的 `snapshot()` RPC 从不写存储，可安全高频轮询。
- 监控建议：对 `openShardCount > 0` 或任一 `state.isOpen === true` 分片触发告警，
  并在连续一段时间内 `isOpen` 持续时升级通知——它代表上游供应商持续不可用。
- 该端点无上游成本、不套 `accessControl`/`rateLimit`（与 `/api/health` 一致）；
  若暴露在公网，注意其中不含密钥/请求体，仅为熔断状态元数据。

---

## 9. 生产检查清单

部署到生产前逐项确认：

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿
- [ ] `npx wrangler deploy --dry-run` 退出码 0
- [ ] D1 迁移已应用（本地 dry-run + 生产 remote）
- [ ] `OPENAI_API_KEY` / `CLIENT_ACCESS_TOKEN` 等 secret 已设置
- [ ] `ALLOWED_ORIGINS` 已包含生产前端域名
- [ ] 上游供应商消费硬上限已配置
- [ ] 部署后可访问 `https://<worker>.workers.dev`（或自定义域名）验证登录/摄像头/Chat/会话恢复
- [ ] `GET /api/circuit` 返回 200 且列出预期分片（可对 `openShardCount` 配置告警）
- [ ] 记录本次 deployment id 存档（便于回滚）

---

## 10. 相关文档

- `docs/design.md` — 架构与用户故事
- `docs/upgrade-roadmap.md` — 升级路线图（含部署相关 M5.3 说明）
- `docs/roadmap.md` — 早期开发 PR 历史
- `.trellis/spec/backend/database.md` — D1 数据层规范
