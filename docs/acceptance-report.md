# 验收报告（Reproducible Acceptance Report）

> ④ 质量 / 合规收尾 —— 把 E2E 覆盖率、a11y 专项、性能基线再夯实一轮，
> 给答辩准备一份**可复现的验收报告**。本文档固化每一项验收的**复现命令、
> 断言口径与当前基线**，评审 / 答辩可直接照做验证。

## 1. 复现前置

- Node.js 24+、corepack、pnpm 11.6.0。
- 一次性安装：`corepack enable && corepack pnpm install --frozen-lockfile`。
- 全部命令在仓库根目录执行。

## 2. 质量门禁（静态 + 单测 + 构建）

| 检查 | 命令 | 断言 |
|---|---|---|
| 类型检查 | `pnpm typecheck` | 0 错误 |
| Lint | `pnpm lint` | 0 警告 |
| 单元测试 | `pnpm test:unit` | 全部通过（含新增 cost-cockpit / cost-calibration） |
| Worker 路由测试 | `pnpm test:worker` | 全部通过 |
| 构建 | `pnpm build`（tsc + vite） | 成功 |
| 打包体积 | `pnpm check:bundle-size` | gzip 主包 < 300 KB |

## 3. E2E 覆盖

| 覆盖路径 | 文件 | 断言 |
|---|---|---|
| 无凭证启动 | `launch.spec.ts` | 工作台加载，错误降级清晰 |
| Chat 文本对话 | `chat.spec.ts` | 文本对话可交互 |
| Realtime 启停 | `realtime.spec.ts` / `realtime-start-stop.spec.ts` | 会话启停 |
| 会话持久化 / 恢复 / 切换 / 重命名 / 删除 | `persistence.spec.ts` / `session-restore.spec.ts` / `session-switching.spec.ts` / `session-rename-delete.spec.ts` | 会话 CRUD |
| 成本面板交互 | `cost-panel-interaction.spec.ts` | 响应预算 / 文本摘要开关 |
| 会话预算守护 | `budget-guard.spec.ts` | 进度条 / 预警 / 清除 |
| 服务商价格表 | `usage-price-table.spec.ts` | Chat / Realtime 价格回显 |
| Realtime 用量持久化 | `realtime-usage-persistence.spec.ts` | 用量记录持久化 |
| 文本历史 / 预算边界 | `text-history-budget.spec.ts` | 边界路径 |
| 成本驾驶舱 | `cost-cockpit.spec.ts` | 预算护栏 / 超限标注 / 趋势外推 |
| 无障碍专项 | `a11y.spec.ts` | 主页面 + 侧边栏 + 成本驾驶舱无严重违规 |
| 性能基线（滚动帧率） | `perf-transcript.spec.ts` | ≥ 55 FPS |
| 响应式 | `responsive.spec.ts` | 断点行为 |
| 主题 / 语言 | `theme.spec.ts` / `theme-language.spec.ts` / `i18n.spec.ts` | 主题切换 / i18n |

运行方式：
```bash
pnpm build                      # E2E 依赖 dist/
pnpm test:e2e                   # 全量 E2E
pnpm test:e2e:smoke             # CI 冒烟子集（@smoke）
```

## 4. 性能基线

见 `docs/perf-baseline.md`（Lighthouse 审计口径）。复现：

```bash
pnpm build
CHROME_PATH=<你的Chrome二进制> pnpm perf:audit
```

基线（2026-08-20）：Performance 0.99 / LCP 0.6s / FCP 0.5s / CLS 0.067 / TBT ~0ms。

## 5. 成本看板与校准专项验收

| 能力 | 验收点 | 位置 |
|---|---|---|
| 成本驾驶舱（④） | 预算护栏摘要 + 逐会话成本（超限/接近标注）+ 趋势外推 | `cost-cockpit.ts` / `CostCockpitPanel` / `e2e/cost-cockpit.spec.ts` |
| 成本校准（②） | 估算 vs 实测差异度量 / 实测单价换算 | `cost-calibration.ts` / `docs/cost-calibration.md` |
| 校准 runbook | 固定场景实测 → 汇总偏差 → 判断是否回调单价 | `docs/cost-calibration.md` |

## 6. 已知说明 / 兜底口径

- 前端「估算成本」为展示辅助，真实账单以 provider 控制台为准（i18n `billVerifyProvider`）。
- Lighthouse INP 为真实交互采样指标，实验室加载审计不产生，故不设硬断言；交互响应性由
  `e2e/perf-transcript.spec.ts`（滚动帧率）与成本面板交互路径兜底。
- 校准若发现整体偏差 > 10%，需回调 `cost-model` 单价并在 PR 中说明新旧来源。

## 7. 依赖与原创声明

本工程未引入新的第三方运行时依赖；新增的 cost-cockpit / cost-calibration 均为本项目
原创的纯 TypeScript 模块。E2E 与文档均为本项目原创。已在 README 声明所有第三方库
（React / Vite / Hono / Cloudflare Workers / Tailwind / shadcn/ui / lucide / i18next 等）。
