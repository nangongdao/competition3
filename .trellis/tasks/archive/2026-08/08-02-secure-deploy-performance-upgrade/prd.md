# 安全加固与性能升级改造（依据 UPGRADE_PLAN.md 与 PERFORMANCE_UPGRADE.md）

## Goal

按仓库根目录两份审计方案对 `competition3`（AI 视觉对话助手）实施升级：
`UPGRADE_PLAN.md`（安全 / 工程质量 / 可部署性）与 `PERFORMANCE_UPGRADE.md`（性能 / 视觉能力）。
目标是让项目**能部署、防白嫖、跑得稳、核心卖点（视觉理解）默认可见**。

## What I Already Know

- 当前分支 `feat/conversation-productivity-performance`，HEAD `a312cb3`。
- `wrangler.toml`（未提交改动）声明 `UPSTREAM_CIRCUIT_BREAKER` DO，但 `src/worker/index.ts` 未导出 → `wrangler deploy --dry-run` 失败（DEPLOY-01，已复现）。
- `feat/worker-upstream-resilience` 分支含完整熔断器实现（`app.ts`、`durable-objects/`、`lib/upstream/resilience.ts` 368 行 + 测试），与当前分支共享基 `10edad2`，日期同为 2026-07-15。
- `src/worker/` 下无任何入站鉴权、限流、CORS 限制（SEC-01）；`content-length` 前置检查可绕过（SEC-03）；上游错误原文回传客户端（SEC-02）。
- 依赖 26 个已知漏洞（2 Critical / 13 High），`react-router` 随 dist 上线（SEC-04）。
- 前端 `frame-diff.ts` 为 32×18 网格亮度均值差单层判定（漏检小物体 + 光照误触发）；帧采样在主线程同步 `getImageData` + `toDataURL`（15–40ms 掉帧）。
- 默认配置 `OPENAI_CHAT_VISION_INPUT = "disabled"`，视觉能力默认关闭。
- 无 CI（QUAL-01）。

## Assumptions

- 本任务覆盖文档中**阶段一（止血）全部项 + 性能 P0/P1**；阶段二架构重构（ARCH-01/02 全量拆分）与 P2 能力进阶超出本次范围，仅做 ARCH-01 步骤 1 的纯函数抽取等低风险增量。
- DEPLOY-01 采用文档方案 A：合并 `feat/worker-upstream-resilience`。冲突时保留分支结构，再叠加当前分支路由改动。
- 密钥类（`CLIENT_ACCESS_TOKEN`、`OPENAI_API_KEY`）不写入代码与仓库，走 `wrangler secret` 与环境变量；`wrangler.toml` 的 `[vars]` 保持已提交版本之外的本地配置不回传。
- 前端不引入新依赖（虚拟滚动、状态库等暂缓），延续现有"纯函数 + 测试"模式。

## Requirements

### 阶段一：恢复可部署 + 止血
- [ ] DEPLOY-01：合并 `feat/worker-upstream-resilience`，`wrangler deploy --dry-run` 退出码 0；顺带解决 ARCH-03（上游超时）。
- [ ] SEC-01：接入 Origin 白名单 + 客户端令牌（`access-control` 中间件）+ DO 滑动窗口限流（`RateLimiter`）；未带令牌 401、超频 429。
- [ ] SEC-03：接入 Hono `bodyLimit`（speech 11MB / chat 9MB / realtime 64KB），删除失效的 `content-length` 检查。
- [ ] SEC-02：三处上游错误响应脱敏（chat / speech / realtime），生产环境不回传原文；更新对应测试断言。
- [ ] SEC-04：升级 `react-router` / `vitest` / `hono`，`pnpm audit` 无 Critical/High。
- [ ] SEC-05：为 `secureHeaders` 补 CSP。
- [ ] QUAL-01：新建 `.github/workflows/ci.yml`（含部署干跑门禁）。

### 性能 P0
- [ ] §2 帧差分三层判定（局部变化 + 光照补偿），`reason` 字段供 UI 展示；补单测。
- [ ] §1 帧处理移入 Worker（OffscreenCanvas），主线程采样 <2ms。

### 性能 P1
- [ ] §3 视觉能力分级 `resolveVisionCapability` + 默认配置修正（vision enabled 推荐配置）与 UI 提示。
- [ ] §4 成本模型 `estimateImageTokens` + UI 展示节省金额（如可行且低风险）。

### 工程化
- [ ] 涉及公共行为变化时更新前端契约文档。
- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`git diff --check` 全绿。

## Acceptance Criteria

- [ ] `npx wrangler deploy --dry-run` 退出码为 0。
- [ ] 未带 `x-client-token` 的 `/api/chat/*` 请求返回 401；同一 IP 超频返回 429 与 `Retry-After`。
- [ ] 无 `content-length` 的超大 body 被 413 拒绝。
- [ ] `ENVIRONMENT=production` 时上游错误响应不含原文 snippet。
- [ ] `pnpm audit` 无 Critical / High 漏洞。
- [ ] CI workflow 文件就绪（含 `wrangler deploy --dry-run` 步骤）。
- [ ] `frame-diff` 测试覆盖局部变化检出与光照不误触。
- [ ] 帧采样路径使用 Worker / OffscreenCanvas（不再主线程 `toDataURL`）。
- [ ] 视觉能力解析函数有测试；默认配置文档说明。
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿。

## Definition of Done

- 每个新增/修改模块均有单元测试（沿用 vitest + 纯函数风格）。
- Lint / typecheck / test / build 全绿。
- 契约文档（README / spec）在行为变化时同步。
- 提交到 `feat/secure-deploy-performance-upgrade` 分支并通过 PR 合入。

## Technical Approach

- **后端**：合并 resilience 分支获得 `executeUpstreamRequest`（超时 + 重试 + 熔断）；新增 `middleware/access-control.ts`、`middleware/rate-limit.ts`、`durable-objects/rate-limiter.ts`；`index.ts`/`app.ts` 统一接线 CORS + 鉴权 + 限流 + bodyLimit + CSP；错误响应统一经 `createSafeUpstreamError` 脱敏。
- **前端**：`frame-diff.ts` 升级为三层判定（纯函数，可测）；帧处理抽到 `frame-processor.worker.ts`；`cost-model.ts` 增加 `estimateImageTokens`；视觉能力提示接入 `use-provider-config` 数据流。
- **测试**：新增 `access-control.test.ts`、`rate-limit.test.ts`、`frame-diff` 增强用例、`vision-capability.test.ts`、`cost-model` 增强用例；更新三处路由测试断言。

## Decision (ADR-lite)

**Context**: DEPLOY-01 有两解——合并已有 1,300+ 行含测试的 resilience 分支，或从零重写。
**Decision**: 合并分支（文档方案 A），冲突时保留分支结构、叠加当前分支路由改动。
**Consequences**: 一次解决部署阻断 + 上游超时 + 熔断能力；合并冲突主要集中于三个 route 文件与 `types.ts`，需手工对齐。

## Out of Scope

- ARCH-01 完整拆分（步骤 2–4：VAD hook 抽取、reducer 收敛、UI 子组件拆分）——留待后续任务。
- ARCH-02 统一会话编排层 `use-assistant-session`。
- PERFORMANCE_UPGRADE P2/P3：场景记忆、空间定位标注、多模态融合、转写虚拟化。
- 真实用户体系（JWT / Cloudflare Access）——令牌机制足够阻挡自动化扫描。

## Technical Notes

- 参考资料：`.trellis/spec/backend/security.md`、`backend/api-patterns.md`、`backend/error-logging.md`、`shared/dependency-versions.md`、`shared/code-quality.md`、`frontend/hooks.md`。
- 上游升级文档：`UPGRADE_PLAN.md`、`PERFORMANCE_UPGRADE.md`（已复制到 `research/` 供追溯）。
- 当前 `src/worker/types.ts` 37 行，需随 middleware 扩展 `AppEnv["Bindings"]`（`RATE_LIMITER`、`CLIENT_ACCESS_TOKEN`、`ALLOWED_ORIGINS`）。
- `worker-configuration.d.ts`（566KB 生成文件）不追踪。
