# 商用级成熟度升级路线图

> AI 视觉对话助手（competition3）从竞赛可用走向"商用级成熟度"的升级计划。
> 制定日期：2026-08-11。优先导向：**均衡**——先补成熟度短板，再叠加亮点功能。
>
> ## 与现有文档的关系
>
> | 文档 | 状态 | 关系 |
> |---|---|---|
> | `UPGRADE_PLAN.md`（根目录，2026-08-01 安全审计） | 部分过时 | 其 Critical/High 项已在 08-02 任务中修复；本文档第 1 节标注已完成项，不再重复规划 |
> | `PERFORMANCE_UPGRADE.md`（根目录，2026-08-01 性能审计） | 部分过时 | P0（帧差分三层、Web Worker 帧处理）已完成；P1/P2 未实现项并入本文档 M3/M4 |
> | `docs/roadmap.md` | 活跃 | 成本模型驱动的 PR 历史记录（#1-#18）；本文档是其后续升级阶段，不取代其历史表 |
> | `docs/design.md` | 活跃 | 架构与用户故事；本文档 M1 拆分需与其对齐 |
>
> 本文文档化的是 **2026-08-11 之后** 的升级工作。之前的交付历史见 `docs/roadmap.md` 第 2 节。

---

## 1. 当前状态基线（已完成的硬化）

下列工作在 08-02 `secure-deploy-performance-upgrade` 任务中已合入 `feat/secure-deploy-performance-upgrade` 分支，本文档不重复规划，仅作为基线确认：

| 领域 | 已完成项 | 位置 |
|---|---|---|
| 访问控制 | `X-Client-Token` + Origin 白名单 | `src/worker/middleware/access-control.ts` |
| 限流 | DO 滑动窗口限流（chat 20/min, speech 15/min, realtime 3/min） | `src/worker/durable-objects/rate-limiter.ts` |
| 请求体上限 | `bodyLimit` 流层面截断（speech 11MB / chat 9MB / realtime 64KB） | `src/worker/app.ts` |
| 上游韧性 | 超时 + 单次幂等重试 + 取消 + SQLite DO 熔断器（按 provider×operation 分片） | `src/worker/lib/upstream/resilience.ts`、`durable-objects/upstream-circuit-breaker.ts` |
| 安全响应头 | CSP（script/style self, media/img blob）、secureHeaders | `src/worker/app.ts` |
| 帧差分 | 三层判定（局部变化 / 全局变化 / 光照容忍 / 静态），48×27 网格 | `app/modules/assistant/lib/frame-diff.ts` |
| 帧处理离线 | Web Worker + OffscreenCanvas，主线程采样 <2ms | `app/modules/assistant/workers/frame-processor.worker.ts` |
| 帧剪枝 | 已消费帧从历史删除，避免重复计费 | `app/modules/assistant/lib/frame-pruning.ts` |
| CI | lint + typecheck + test + build + `wrangler deploy --dry-run` | `.github/workflows/ci.yml` |

**结论**：生存层（可部署、不被刷爆额度、上游不雪崩）已达标。本文档聚焦"成熟度层"。

---

## 2. 商用级成熟度差距总览

| 维度 | 当前评级 | 目标评级 | 主要差距 |
|---|---|---|---|
| 前端架构 | ★★☆☆☆ | ★★★★★ | `assistant-workspace.tsx` 2,473 行、18 useState/11 useRef 集中顶层；无全局状态管理 |
| Hook 内聚 | ★★☆☆☆ | ★★★★☆ | `use-realtime-session.ts` 1,123 行；四套对话路径并存无统一编排 |
| UI/UX 体系 | ★★☆☆☆ | ★★★★★ | 无组件库/设计 token；无暗色模式；响应式仅 1 断点；1,490 行手写 CSS |
| 数据持久化 | ★☆☆☆☆ | ★★★★☆ | 会话历史不持久化（localStorage 仅布局）；无 D1/KV/R2 |
| 流式体验 | ★★☆☆☆ | ★★★★☆ | Chat 模式一次性 JSON 返回，无 SSE 逐字输出 |
| 国际化 | ★☆☆☆☆ | ★★★☆☆ | 中文硬编码，无 i18n 框架 |
| 视觉能力可见性 | ★★☆☆☆ | ★★★★☆ | 视觉能力开关不可见，模型能力未分级探测 |
| 测试覆盖 | ★★★☆☆ | ★★★★☆ | 133 单测/集成，无 E2E，`components/` 零测试 |
| 工程化 | ★★★☆☆ | ★★★★☆ | CI 已有，缺性能基线与部署 runbook |

---

## 3. 里程碑总览

均衡导向：M1-M2 补地基，M3 数据与流式，M4 亮点，M5 收尾。每里程碑 1-2 周。

| 里程碑 | 主题 | 核心交付 | 工期 | 阻塞下游 |
|---|---|---|---|---|
| **M1** | 架构地基 | 巨型组件拆分、状态收敛、统一会话编排 | 1.5 周 | 阻塞 M2-M4 |
| **M2** | UI/UX 体系 | shadcn/ui + 设计 token、暗色模式、响应式、虚拟化 | 1.5 周 | i18n 依赖其完成 |
| **M3** | 数据与流式 | SSE 流式、D1 持久化、多会话、i18n、视觉分级 | 2 周 | M4 依赖持久化层 |
| **M4** | 亮点能力 | 场景记忆、多模态融合、空间标注 | 1.5 周 | — |
| **M5** | 工程化收尾 | E2E、组件测试、部署 runbook、性能基线 | 1 周 | — |

总计约 7-8 周（无硬节点，可压缩或并行）。

---

## 4. M1 — 架构地基（1.5 周）

**目标**：把 2,473 行巨型组件降到 ≤300 行编排层，1,123 行 Realtime hook 拆成 ≤400 行模块，状态收敛为可测 reducer，对外暴露统一会话接口。

> 规范依据：`.trellis/spec/frontend/components.md`、`directory-structure.md`、`shared/code-quality.md`（单文件 200-400 行）。

### M1.1 抽取纯函数到 lib + 单测

- **动机**：`assistant-workspace.tsx` 中混有纯函数（音频 RMS、下载工具等），不可测；先抽零风险增量。
- **方案**：将 `getAudioContextConstructor`、`calculateAudioRootMeanSquare`、`buildDownloadDataUrl`、`downloadTextFile` 等迁到 `app/modules/assistant/lib/audio-utils.ts` 与 `lib/download.ts`，并补单测。
- **涉及文件**：`components/assistant-workspace.tsx`（瘦身）、新增 `lib/audio-utils.ts`、`lib/download.ts` 及 `.test.ts`。
- **工期**：0.5 天
- **优先级**：P0
- **验收**：新模块单测覆盖 ≥90%；主组件行数下降；`pnpm test` 全绿。
- **依赖**：无

### M1.2 连续对话 VAD 抽成独立 hook

- **动机**：连续语音轮替逻辑（录音→ASR→发送→TTS→再录音）散落在巨型组件中，与 06-14 任务重叠。
- **方案**：抽成 `hooks/use-continuous-chat-vad.ts`，接口 `useContinuousChatVad({ enabled, onUtteranceComplete }): { isRecording, audioLevel, start, stop }`。
- **涉及文件**：新增 `hooks/use-continuous-chat-vad.ts` + 测试；`assistant-workspace.tsx` 引用替换。
- **工期**：1 天
- **优先级**：P0
- **验收**：hook 独立可测；VAD 状态机单测覆盖 start/stop/utterance 边界；主组件减少 ≥150 行。
- **依赖**：M1.1

### M1.3 状态收敛为 reducer + 单测

- **动机**：18 个 useState 集中顶层，任一变化重渲染整棵子树；reducer 是纯函数可直接测。
- **方案**：会话强相关状态（`phase`、`transcript`、`frameStats{sampled,sent,skippedAuto}`、`lastFrameDataUrl`）合并为 `useReducer`，定义 `AssistantState` / `AssistantAction` 联合类型与 `assistantReducer`。
- **涉及文件**：新增 `state/assistant-reducer.ts` + 测试；`assistant-workspace.tsx` 接入。
- **工期**：1 天
- **优先级**：P0
- **验收**：reducer 覆盖全部 action 分支的单测；自动采样时 setState 次数从 3 降至 1（React DevTools 验证）。
- **依赖**：M1.1

### M1.4 巨型组件 UI 拆分

- **动机**：单文件承载 12+ 关注点，违反 200-400 行规范 6 倍；不可测。
- **方案**：按目录拆分——
  ```
  app/modules/assistant/components/
  ├── assistant-workspace.tsx        # 编排层 ≤200 行，只组合
  ├── media/camera-preview.tsx       # 摄像头预览 + 权限提示
  ├── media/frame-sampling-panel.tsx # 采样控制 + 差分计数展示
  ├── session/realtime-controls.tsx  # Realtime 启停 / VAD / 静音
  ├── session/chat-controls.tsx      # Chat 模式控制
  ├── conversation/transcript-list.tsx  # 已存在，保留
  ├── conversation/message-composer.tsx # 文本输入 + 语音输入
  └── usage/usage-meter.tsx         # 用量与成本展示
  ```
- **工期**：2-3 天
- **优先级**：P0
- **验收**：主组件 ≤200 行；各子组件 ≤300 行；`pnpm typecheck && pnpm test && pnpm build` 全绿；纯展示子组件加 `memo`。
- **依赖**：M1.1-M1.3

### M1.5 use-realtime-session.ts 拆分

- **动机**：1,123 行单 hook 耦合 WebRTC 信令、数据通道、用量解析、错误恢复。
- **方案**：拆为 `hooks/realtime/webrtc-peer.ts`（SDP/ICE）、`hooks/realtime/data-channel.ts`（oai-events 收发）、`hooks/realtime/usage-collector.ts`（response.done 解析），`use-realtime-session.ts` 仅做编排（≤400 行）。
- **工期**：1.5 天
- **优先级**：P1
- **验收**：各子模块单测；WebRTC 连接生命周期测试通过；原 hook 行为无回归（手动 Realtime 联调）。
- **依赖**：M1.4

### M1.6 统一会话编排层

- **动机**：Realtime 与 Chat 四套路径并存，模式切换可能泄漏 WebRTC 连接。
- **方案**：新建 `hooks/use-assistant-session.ts` 作为唯一对外接口，内部按 provider mode 分派，模式切换时 `useEffect` 清理上一会话。
- **涉及文件**：新增 `hooks/use-assistant-session.ts`；`assistant-workspace.tsx` 改为消费统一接口。
- **工期**：1 天
- **优先级**：P1
- **验收**：DevTools 验证模式切换无连接泄漏；统一接口单测覆盖分派逻辑。
- **依赖**：M1.5

**M1 出口标准**：主组件 ≤200 行、`use-realtime-session.ts` ≤400 行、新增模块单测覆盖 ≥80%、全量质量门禁绿。

---

## 5. M2 — UI/UX 体系（1.5 周）

**目标**：建立可复用组件体系与设计 token，支持暗色模式与移动端，缩减 1,490 行手写 CSS。

> 规范依据：`.trellis/spec/frontend/workspace-layout.md`、`components.md`。

### M2.1 引入 shadcn/ui + 设计 token

- **动机**：手写 Tailwind + 1,490 行 CSS 不可扩展，无 a11y 保障。
- **方案**：引入 shadcn/ui（Radix UI + Tailwind，代码落地仓库可改）。建立三层 token：primitive（色板/间距/字号）→ semantic（bg/fg/border/accent）→ component。用 CSS 变量驱动。
- **涉及文件**：新增 `app/styles/tokens.css`、`app/components/ui/*`（Button/Card/Dialog/Input/Tooltip 等）；`tailwind.config`/`app.css` 接入。
- **工期**：2 天
- **优先级**：P0
- **验收**：至少 8 个基础组件可用；token 通过暗色模式切换验证；`app.css` 减少 ≥300 行。
- **依赖**：M1 完成（避免在巨型组件上叠组件库）

### M2.2 暗色模式

- **动机**：商用级产品标配；摄像头预览在暗色下观感更佳。
- **方案**：`prefers-color-scheme` 自动 + 手动切换 toggle，偏好存 localStorage（复用现有 `use-workspace-layout.ts` 的 zod 校验模式）。
- **工期**：0.5 天
- **优先级**：P1
- **验收**：三态（system/light/dark）切换无闪烁；所有组件 token 化，无硬编码颜色。
- **依赖**：M2.1

### M2.3 响应式断点体系

- **动机**：当前仅 1 个 `@media (max-width:980px)` 断点，移动端不可用。
- **方案**：定义 sm/md/lg/xl 断点（Tailwind 默认即可），重构工作区为移动端优先：竖屏堆叠布局、抽屉式控制面板、摄像头预览自适应。
- **工期**：1.5 天
- **优先级**：P1
- **验收**：375px/768px/1024px/1440px 四档目视无溢出；移动端可单手操作核心流程。
- **依赖**：M2.1

### M2.4 转写列表虚拟化

- **动机**：长会话转写累积数百条，全量渲染逐渐卡顿。
- **方案**：引入 `react-window`（或 `@tanstack/react-virtual`）对 `transcript-list.tsx` 做窗口化渲染。
- **涉及文件**：`components/conversation/transcript-list.tsx`。
- **工期**：0.5 天
- **优先级**：P2
- **验收**：1000 条转写下渲染帧率 ≥55 FPS；滚动无白屏。
- **依赖**：M1.4

### M2.5 缩减自定义 CSS

- **动机**：1,490 行 `app.css` 与 Tailwind 大量重复，维护成本高。
- **方案**：逐块迁移到 Tailwind 工具类或组件 token，目标 `app.css` ≤400 行（仅保留无法工具化的全局样式）。
- **工期**：1 天
- **优先级**：P2
- **验收**：`app.css` ≤400 行；视觉无回归（对比截图）。
- **依赖**：M2.1-M2.3

**M2 出口标准**：设计 token 体系落地、暗色模式可用、四档响应式无溢出、`app.css` ≤400 行。

---

## 6. M3 — 数据与流式（2 周）

**目标**：补齐商用级对话产品的数据层与流式体验，国际化与视觉能力可见化。

> 规范依据：`.trellis/spec/backend/database.md`、`api-module.md`、`big-question/cross-layer-contract.md`。

### M3.1 Chat SSE 流式输出

- **动机**：当前 Chat 模式一次性 JSON 返回，长回答时用户长时间空白等待；商用级对话产品标配逐字输出。
- **方案**：Worker `/api/chat/completion` 增加 `stream: true` 透传上游 SSE，过滤后用标准 `text/event-stream` 回传前端；前端 `use-chat-completion.ts` 改为消费 SSE 流，逐字追加到转写区。Realtime 模式天然流式不受影响。
- **涉及文件**：`src/worker/routes/chat/router.ts`、`app/modules/assistant/hooks/use-chat-completion.ts`、新增流解析 `lib/sse-parser.ts` + 测试。
- **工期**：2 天
- **优先级**：P0
- **验收**：Chat 首字延迟 <800ms（受上游影响）；浏览器取消（AbortController）能中断上游流；流解析单测覆盖 chunk 边界与多行 data。
- **依赖**：M1.6 统一会话接口（便于接入流式状态）

### M3.2 D1 会话持久化

- **动机**：会话历史仅存内存，刷新即失；商用级需跨会话恢复。
- **方案**：引入 Cloudflare D1（SQLite）。Schema：`sessions(id, title, created_at, updated_at, provider_mode)`、`messages(id, session_id, role, content, modality, tokens, created_at)`、`frames(id, session_id, message_id, data_url_ref, created_at)`。大帧数据（data URL）存 R2 或 D1 的 `attachment`，主表只存引用。Worker 新增 `/api/sessions/*` CRUD。
- **涉及文件**：`wrangler.toml`（D1 binding）、`src/worker/routes/sessions/*`、`src/worker/lib/db/migrations/`、前端 `app/modules/assistant/hooks/use-sessions.ts`。
- **工期**：2.5 天
- **优先级**：P0
- **验收**：迁移脚本幂等；CRUD 路由单测 + Workers pool 集成测试；前端刷新后会话恢复。
- **依赖**：M3.1（消息表需承载流式增量写入）

### M3.3 多会话管理

- **动机**：商用级需会话列表、切换、重命名、删除、导出。
- **方案**：新增会话侧边栏（Sidebar 组件，复用 shadcn/ui），支持新建/切换/重命名/删除/导出 JSON-Markdown。空会话自动清理。
- **涉及文件**：`app/modules/assistant/components/session/sidebar.tsx`、`hooks/use-sessions.ts`。
- **工期**：1.5 天
- **优先级**：P1
- **验收**：会话切换 <200ms；导出文件含完整转写与时间戳；并发切换无脏读。
- **依赖**：M3.2、M2.1（组件）

### M3.4 i18n 国际化

- **动机**：中文硬编码文案量大；商用级需中/英双语。放在 M2 之后避免二次翻动组件。
- **方案**：引入 `react-i18next`（轻量、SSR 友好）。抽取文案到 `app/locales/zh.json`、`en.json`。语言切换存 localStorage，跟随 `navigator.language` 默认。
- **涉及文件**：新增 `app/locales/*`、`app/i18n.ts`；全组件文案替换为 `t('key')`。
- **工期**：1.5 天
- **优先级**：P1
- **验收**：中/英全量覆盖（`i18next-parser` 抽取无遗漏 key）；切换即时无刷新；键盘可访问。
- **依赖**：M2 完成

### M3.5 视觉能力分级探测

- **动机**：当前 `OPENAI_CHAT_VISION_INPUT` 开关对用户不可见；"视觉助手"默认可能无视觉。
- **方案**：Worker 侧 `lib/vision-capability.ts` 维护已知模型能力表（`none`/`single-image`/`multi-image`），`/api/provider/config` 返回 `visionCapability` 字段；前端展示能力徽章与"当前模型不支持视觉，推荐配置 →"提示。
- **涉及文件**：`src/worker/lib/vision-capability.ts`、`routes/provider/router.ts`、前端 `use-provider-config.ts` + UI 徽章。
- **工期**：0.5 天
- **优先级**：P1
- **验收**：已知模型探测正确；未知模型保守返回 none 并提示；徽章在暗色模式下可读。
- **依赖**：M2.1

### M3.6 成本模型精确化 + UI 实时成本

- **动机**：`cost-model.ts` 未体现图像 token 分块规则；用户对"省了多少钱"的感知强于"跳过几帧"。
- **方案**：实现 `estimateImageTokens(w,h)`（base 85 + 170×⌈w/512⌉×⌈h/512⌉）；`compareResolutionCosts` 展示降分辨率收益；UI 把跳过帧数翻译为"≈¥X.XX 节省"。
- **涉及文件**：`app/modules/assistant/lib/cost-model.ts` + 测试、`usage/usage-meter.tsx`。
- **工期**：1 天
- **优先级**：P2
- **验收**：640×360→425、512×288→255 计算单测通过；UI 实时显示累计节省金额。
- **依赖**：M3.5

**M3 出口标准**：Chat 流式可用、D1 会话可持久化与恢复、中/英双语切换、视觉能力可见、成本可视化。

---

## 7. M4 — 亮点能力（1.5 周）

**目标**：在稳固地基上叠加差异化能力，强化"视觉对话"核心卖点。

> 这些条目源自 `PERFORMANCE_UPGRADE.md` §5，依赖 M3 的持久化与流式基础设施。

### M4.1 场景记忆（关键帧文字摘要）

- **动机**：每轮独立发图，5 轮对话图像成本 2125 token；用文字摘要代替历史图片可降 ~73% 且保持场景连续性。
- **方案**：`SceneMemoryStore` 保留最近 N 个关键帧的一句话描述（由模型生成），后续轮次注入为低成本文本上下文，仅最新帧以图片发送。
- **涉及文件**：新增 `app/modules/assistant/lib/scene-memory.ts` + 测试；`use-assistant-session.ts` 接入。
- **工期**：2 天
- **优先级**：P1
- **验收**：5 轮对话图像 token ≤600（vs 2125 基线）；场景描述准确性人工评估 ≥80%；摘要持久化到 D1（跨会话恢复）。
- **依赖**：M3.2

### M4.2 多模态输入融合

- **动机**：语音、文本、画面当前三条独立路径，语音与画面变化分两次调用增加 API 往返与成本。
- **方案**：`buildMultimodalTurn(transcript, frame, sceneContext)` 在用户说话同时画面变化时合并为单次请求。
- **涉及文件**：新增 `lib/multimodal-turn.ts` + 测试；`use-assistant-session.ts`。
- **工期**：1.5 天
- **优先级**：P2
- **验收**：并发语音+帧变化触发单次请求；融合 vs 分离的延迟与成本对比记录。
- **依赖**：M4.1

### M4.3 空间定位标注

- **动机**：让模型不只回答"这是什么"，还能指出"在哪里"，在摄像头预览叠加标注框——视觉冲击力强。
- **方案**：定义 `SpatialAnnotation { label, box{x,y,w,h} }`（归一化坐标）；Worker prompt 引导模型返回结构化标注；前端在 `<video>` 上叠加绝对定位的标注层。
- **涉及文件**：新增 `lib/spatial-annotation.ts`、`components/media/annotation-overlay.tsx`；Worker prompt 调整。
- **工期**：2 天
- **优先级**：P2
- **验收**：标注框位置误差 <10%（归一化）；标注层不阻塞摄像头预览交互；依赖模型能力，对不支持者优雅降级为纯文本。
- **依赖**：M3.5（视觉能力探测决定是否启用）

**M4 出口标准**：场景记忆降本 ≥70%、多模态融合可用、空间标注在支持的模型上可见。

---

## 8. M5 — 工程化收尾（1 周）

**目标**：补齐商用级工程化门禁与运维文档。

> 规范依据：`.trellis/spec/shared/code-quality.md`。

### M5.1 Playwright E2E

- **动机**：当前无 E2E，关键用户路径无回归保障。
- **方案**：Playwright 覆盖三条核心路径：无凭证启动→配置提示、Chat 模式文本对话、Realtime 启停（mock WebRTC）。CI 中跑 smoke 子集。
- **涉及文件**：新增 `e2e/*.spec.ts`、`playwright.config.ts`；CI job。
- **工期**：1.5 天
- **优先级**：P1
- **验收**：CI 跑通 smoke 子集；本地全量 E2E 通过。
- **依赖**：M1-M3 稳定

### M5.2 组件测试补强

- **动机**：`components/` 当前零测试（`lib/` 全覆盖）。
- **方案**：用 Testing Library 为 `camera-preview`、`transcript-list`、`usage-meter`、`message-composer` 等补组件测试，覆盖渲染、交互、a11y。
- **工期**：1.5 天
- **优先级**：P1
- **验收**：`components/` 测试覆盖 ≥70%；CI 通过。
- **依赖**：M1.4 拆分完成

### M5.3 部署与监控 runbook

- **动机**：缺乏运维文档与告警配置指引。
- **方案**：`docs/deployment-runbook.md` 覆盖：Wrangler 部署、D1 迁移、DO 绑定、secret 管理、回滚步骤（参考 08-02 任务的迁移 tag 策略）、Cloudflare 用量告警 + 上游供应商消费硬上限设置。
- **工期**：1 天
- **优先级**：P2
- **验收**：按 runbook 可从零部署到生产；回滚步骤可执行。
- **依赖**：M3.2

### M5.4 性能基线与回归

- **动机**：无性能预算，重构易引入回归。
- **方案**：Lighthouse CI 跑 LCP/INP/CLS，设性能预算（LCP <2.5s、INP <200ms、CLS <0.1）。前端打包体积预算（gzip <300KB）。
- **工期**：1 天
- **优先级**：P2
- **验收**：CI 集成 Lighthouse；超预算 PR 失败。
- **依赖**：M2 完成

**M5 出口标准**：E2E + 组件测试覆盖、部署 runbook 可执行、性能预算落地。

---

## 9. 现有未完任务处置

| 任务 | 当前状态 | 处置 |
|---|---|---|
| `06-14-continuous-chat-voice-compact-layout` | in_progress | 其连续 VAD 逻辑并入 **M1.2**，紧凑 16:9 布局并入 **M2.3**；先收尾归档避免与 M1 重复 |
| `07-13-worker-upstream-resilience` | in_progress（实质完成，有 completion-report + PR #25） | 直接归档；其实现已是 M1 的基线 |
| `00-bootstrap-guidelines` | in_progress（spec 未填） | 作为 M5 工程化的前置：spec 填充与 M5.3 runbook 同步推进 |

---

## 10. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| shadcn/ui 引入增加依赖体积 | 打包变大 | M5.4 性能预算兜底；shadcn 按需引入（仅复制用到的组件源码） |
| D1 迁移误操作丢会话 | 数据丢失 | 迁移脚本幂等 + 回滚保留旧迁移 tag；首次部署前本地 dry-run |
| 巨型组件拆分引入回归 | Realtime/Chat 行为异常 | 每步拆分跑全量 `pnpm test`；M1.4-M1.6 完成后做一次手动 Realtime+Chat 联调 |
| SSE 流式与上游取消竞态 | 连接泄漏 | 复用 07-13 的 AbortController 取消策略；流解析单测覆盖断连 |
| 视觉能力分级表过时 | 误报模型能力 | 表可配置（env 覆盖）；未知模型保守 none + UI 提示 |
| 空间标注依赖模型能力 | 不支持时报错 | 优雅降级为纯文本回答；M3.5 探测决定是否启用 |

**通用回滚策略**：每里程碑独立分支 + PR，`main` 保持可发布。D1/DO 迁移用 wrangler migration tag，回滚部署旧版本 Worker 并保留 binding（参考 08-02 任务的迁移 tag 策略）。

---

## 11. 验收与度量

### 11.1 里程碑出口门禁

每个里程碑 PR 合并前必须：
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全绿
- `npx wrangler deploy --dry-run` 退出码 0
- 新增模块单测覆盖 ≥80%（lib）/ ≥70%（components）
- 相关 E2E（M5 起）通过

### 11.2 商用级成熟度目标度量

| 指标 | 基线 | 目标 | 验证 |
|---|---|---|---|
| 主组件行数 | 2,473 | ≤200 | `wc -l` |
| Realtime hook 行数 | 1,123 | ≤400 | `wc -l` |
| 自定义 CSS 行数 | 1,490 | ≤400 | `wc -l app/app.css` |
| 会话恢复 | 不支持 | 刷新后恢复 | E2E |
| Chat 首字延迟 | 一次性返回 | <800ms | 性能面板 |
| 5 轮图像 token | ~2125 | ≤600（含场景记忆） | token 计数 |
| 转写 1000 条 FPS | 未测 | ≥55 | Performance |
| E2E 覆盖 | 0 | 3 条核心路径 | Playwright |
| 组件测试覆盖 | 0% | ≥70% | 覆盖率报告 |
| i18n 语言数 | 1（中） | 2（中/英） | 抽取校验 |

---

## 12. M1 子任务拆分（首批 Trellis 任务）

M1 作为地基里程碑，立即拆分为以下子任务（`parent` 指向本任务），按依赖顺序执行：

| 子任务 | 对应条目 | 工期 |
|---|---|---|
| `m1-extract-pure-utils` | M1.1 | 0.5 天 |
| `m1-continuous-chat-vad-hook` | M1.2 | 1 天 |
| `m1-assistant-reducer` | M1.3 | 1 天 |
| `m1-split-assistant-workspace` | M1.4 | 2-3 天 |
| `m1-split-realtime-session-hook` | M1.5 | 1.5 天 |
| `m1-unified-assistant-session` | M1.6 | 1 天 |

M2-M5 的子任务在对应里程碑启动时再拆分，避免规划过早漂移。

---

*本路线图基于 2026-08-11 代码状态制定。已修复项以 08-02 任务合并结果为基线，未做推测性结论。*
