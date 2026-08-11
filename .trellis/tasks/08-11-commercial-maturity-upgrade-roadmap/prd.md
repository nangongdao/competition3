# Commercial Maturity Upgrade Roadmap

## Goal

为 AI 视觉对话助手制定"升级到商用级成熟度"的详细改造计划与路线图：
覆盖架构重构、UI/布局升级、性能优化、数据持久化、潜在新功能与工程化补强。
"商用级"指成熟程度（可靠性、可维护性、体验完整度），不要求真实商业化。

## Requirements

* 优先导向：均衡 —— 先补成熟度短板（架构/状态/持久化/测试），再叠加亮点功能。
* 产出物：`docs/upgrade-roadmap.md` 路线图文档 + 第一里程碑（M1）工作包的 Trellis 子任务。
* 节奏：无硬节点，里程碑制（M1-M5），每里程碑 1-2 周。
* 纳入范围：
  - 架构：巨型组件拆分、状态收敛、统一会话编排层。
  - UI：shadcn/ui + 设计 token、暗色模式、响应式/移动端、转写虚拟化。
  - 数据：D1 会话持久化 + 多会话管理、SSE 流式输出。
  - i18n：中/英双语框架（在 UI 体系升级之后做，避免二次翻动组件）。
  - 亮点：视觉能力分级、场景记忆、多模态输入融合、空间定位标注。
  - 工程化：E2E 测试、组件测试补强。
* 路线图必须基于当前代码实际状态；已修复项（访问控制/限流/熔断/CSP/帧差分/Web Worker
  帧处理等）标注"已完成"，不重复规划。
* 每项条目给出：动机、方案概要、工期估算、优先级、验收标准。

## Acceptance Criteria

* [ ] `docs/upgrade-roadmap.md` 产出，含 M1-M5 里程碑、每项条目的动机/方案/工期/验收标准。
* [ ] 与 docs/roadmap.md、UPGRADE_PLAN.md、PERFORMANCE_UPGRADE.md 的关系在文档头部说明。
* [ ] M1 工作包已创建为 Trellis 子任务（parent 指向本任务）。
* [ ] 现有未完任务（06-14、07-13）在路线图中有明确处置（并入/前置/归档）。
* [ ] 用户确认路线图内容。

## Definition of Done

* 文档结构清晰，可直接指导后续任务拆分与实施。
* 不含与当前代码状态矛盾的描述。
* lint/typecheck 不适用（纯文档任务），但 markdown 结构完整。

## Technical Approach

里程碑结构（均衡导向：M1-M2 补短板，M3 数据与流式，M4 亮点，M5 收尾）：

* **M1 架构地基**：assistant-workspace.tsx (2,473 行) 拆分 + reducer 状态收敛、
  use-realtime-session.ts (1,123 行) 拆分、统一会话编排层 use-assistant-session、
  新增模块单测。
* **M2 UI/UX 体系**：shadcn/ui + 设计 token、暗色模式、响应式断点体系、
  转写列表虚拟化、1,490 行自定义 CSS 缩减。
* **M3 数据与流式**：Chat SSE 流式输出、D1 会话持久化 + 多会话管理、
  i18n 框架（中/英）、视觉能力分级 + 成本模型精确化。
* **M4 亮点能力**：场景记忆（关键帧文字摘要）、多模态输入融合、空间定位标注。
* **M5 工程化收尾**：Playwright E2E、组件测试补强、部署与监控文档。

## Decision (ADR-lite)

**Context**: 项目已完成安全/韧性硬化（08-02），下一步方向需要在演示冲击力、
长期成熟度、功能扩展之间取舍。
**Decision**: 均衡路线 —— 先架构与 UI 地基（M1-M2），再数据能力（M3），后亮点（M4）。
UI 采用 shadcn/ui + 设计 token；数据层引入 D1；用户认证不做。
**Consequences**: 亮点功能延后 2-4 周；但拆分后的组件体系使 M3/M4 的每一项都更便宜、
更可测。引入 shadcn/ui 增加依赖但大幅缩减自维护 CSS。

## Out of Scope

* 本任务不实现任何代码改造（实现由 M1 子任务及后续任务承担）。
* 用户认证体系（注册/登录/每用户配额）——远期备选，现有 client token 方案够用。
* 真实商业化（计费、支付、多租户）。

## Technical Notes

* 已核查：README.md、package.json、UPGRADE_PLAN.md（2026-08-01 审计，Critical/High 已修复）、
  PERFORMANCE_UPGRADE.md（P0 已完成，P1/P2 未做）、.github/workflows/ci.yml（存在）、
  app/ 与 src/worker/ 结构。
* 重构热点：app/modules/assistant/components/assistant-workspace.tsx (2,473)、
  app/modules/assistant/hooks/use-realtime-session.ts (1,123)。
* 前端现状：无全局状态管理、无组件库、无 i18n、无暗色模式、响应式仅 1 断点、
  会话历史不持久化（localStorage 仅布局偏好）。
* 后端现状：无 D1/KV/R2；Chat 为一次性 JSON 返回（无 SSE）。
* 测试现状：22 文件约 133 测试（单测 + Workers pool 集成），无 E2E。
* 活动任务：06-14（连续语音+紧凑布局，未完）、07-13（上游韧性，实质完成待归档）。
