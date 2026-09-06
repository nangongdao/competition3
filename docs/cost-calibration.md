# 成本校准（Live Cost Measurement & Calibration）

> ② 接真实 provider 跑一轮实测，用实际账单校准前端 `cost-model` 单价假设。
> 本文档固化**定价假设来源、实测与校准流程、兜底口径说明**，使前端「估算成本」
> 与 provider 真实账单之间的差异可度量、可复现、可向评审交代。

## 1. 目标

前端用量面板展示的「估算成本」本质上把 token 用量按一套硬编码单价换算成 USD。
真实账单以 provider 控制台 / 账单 API 为准。本校准环节回答三件事：

1. **当前估算单价与真实账单的偏差有多大**（绝对差 / 相对百分比）。
2. **偏差来源在哪**（单价漂移？缓存命中率假设？计费粒度差异？）。
3. **是否需要对 `cost-model` 单价做校准、以及如何兜底说明**。

## 2. 定价假设来源（现状）

前端估算所依赖的单价集合定义在 `app/modules/assistant/lib/cost-model.ts`（Realtime）
与 `app/modules/assistant/lib/chat-cost-model.ts`（Chat），并回显在
`app/modules/assistant/lib/usage-prices.ts` 的价格表。

| 模式 | 单价来源 | 计价键 | 兜底口径 |
|---|---|---|---|
| Realtime | `gpt-realtime` 定价页（估算） | input/cached/output × 文本/音频/图像 | 账单以 provider 控制台为准 |
| Chat | Chat Completions 定价（估算） | 输入文本 / 图像分块 / 输出文本 | 账单以 provider 控制台为准 |

> ⚠️ 这些单价是**应用内展示用的估算**，不是计费依据。缓存命中率、模型版本漂移、
> 供应商促销价等都会造成实测与估算的偏差。

## 3. 校准辅助纯函数

代码提供 `app/modules/assistant/lib/cost-calibration.ts`，供实测数据离线分析
（也是测试覆盖的纯函数）：

| 函数 | 作用 |
|---|---|
| `computeCalibrationDelta(sample)` | 单次观测的估算 vs 实测差异（绝对差 / 相对%） |
| `summarizeCalibration(samples)` | 多观测汇总（总量、总偏差、是否整体超支） |
| `measuredPricePerMillion(measuredUsd, inputTokens, outputTokens)` | 由实测账单 + token 用量换算实测单价（USD/1M），与前端硬编码单价对照 |

```ts
import {
  computeCalibrationDelta,
  measuredPricePerMillion,
  summarizeCalibration,
} from "@/modules/assistant/lib/cost-calibration";

// 单次对照
const delta = computeCalibrationDelta({
  label: "session-abc",
  estimatedUsd: 0.1,
  measuredUsd: 0.12,
  inputTokens: 10_000,
  outputTokens: 2_000,
  recordedAt: Date.now(),
});
// → absoluteDeltaUsd: +0.02, relativeDeltaPct: +20%, overrun: true

// 实测混合单价（USD/1M）：0.05 USD / 10k tokens → 5 USD/1M
const price = measuredPricePerMillion(0.05, 8_000, 2_000);
```

## 4. 实测流程（Runbook）

> 前置：准备一个可用且可查看账单的 provider（OpenAI 兼容 Realtime / Chat）。

### 4.1 固定场景

为了可对照，每次实测保持下列变量固定，只改变要对比的维度：

- 场景 / 提示词固定；
- 响应预算（response budget）固定；
- 轮次固定（例如 5 轮）；
- 每轮立刻导出用量报告（`Response usage` 导出 JSON/CSV）。

### 4.2 采集估算与实测

1. **估算**：会话结束后从用量面板导出用量报告（JSON/CSV），其中含
   `estimatedCostUsd`（前端估算）。
2. **实测**：登录 provider 控制台 / 账单 API，取同一时间段、同一会话的**真实计费金额**。
3. **记录**：把「估算金额 + 实测金额 + token 用量 + 场景标识 + 时间」录入校准样本
   （可用 `CalibrationSample` 结构组织，或直接写 JSON）。

### 4.3 运行校准分析

把样本喂给 `summarizeCalibration`，得到总偏差与相对百分比：

```ts
const summary = summarizeCalibration(samples);
console.log(summary.totalRelativeDeltaPct); // 整体偏差（%）
```

若偏差过大（例如 > 20%），对照 `measuredPricePerMillion` 与前端单价表，
判断是**单价漂移**还是**缓存命中率假设偏差**。

## 5. 兜底口径说明（Fallback Disclaimer）

无论实测结果如何，前端展示都应始终附带下列兜底说明（已内置在 i18n
`usage.billVerifyProvider`）：

> 真实账单以 provider 控制台为准。上方金额仅供参考，请在核对自己账单后再作依赖。

该口径的意义：

- 估算成本是**展示/决策辅助**，不是**计费依据**；
- 单价的时效性与供应商促销可能导致偏差；
- 若用户把估算当作强承诺，兜底说明可降低误导风险。

## 6. 校准报告模板

PR 评审时建议附一份 `cost-calibration-report`（可放 `docs/` 或 PR 描述）：

| 场景 | 估算(USD) | 实测(USD) | 绝对差 | 相对差% | 结论 |
|---|---|---|---|---|---|
| 标准 5 轮（Realtime） | 0.10 | 0.12 | +0.02 | +20% | 高估 |
| 文本历史摘要（Chat） | 0.05 | 0.048 | -0.002 | -4% | 接近 |

结论建议：若整体偏差 < 10%，维持当前单价；> 10% 时按 `measuredPricePerMillion`
回调 `cost-model` 的 `REALTIME_PRICES_USD_PER_MILLION` / `CHAT_PRICES_USD_PER_MILLION`，
并在 PR 中说明新旧单价来源与影响。

## 7. Live Measurement 实测工具链（外部项）

为把「跑一次实测 → 出一份可复现报告」落地，项目提供两层工具：

### 7.1 报告构建纯函数 `lib/calibration-report.ts`

把 `CalibrationRecord`（价格集 + 来源 + 逐条估算/实测样本）固化为结构化报告：
逐条差异（绝对差 / 相对%）、汇总、实测混合单价（USD/1M）、与前端价格集对照、
校准结论（maintain / recalibrate-realtime / recalibrate-chat）与建议校正系数、
以及兜底口径。纯函数、可单测，也是 `scripts/measure-cost.mjs` 的分析逻辑源头。

### 7.2 命令行实测分析 `scripts/measure-cost.mjs`

```bash
node scripts/measure-cost.mjs docs/measurement/live-sample.json -o docs/measurement/live-report.md
```

输入为 JSON 实测记录，输出 Markdown 校准报告（可直接写入 docs / PR 描述）。
示例数据与产出报告已随仓库提交：

- 输入：`docs/measurement/live-sample.json`
- 产出：`docs/measurement/live-report.md`

### 7.3 本次实测结论摘要（示例）

对 2 组 Realtime 实测样本（纯文本 + 图像多模态），整体偏差 **16.3%**（估算偏低、
实测偏高），建议**回调 cost-model 单价**，建议校正系数 **×1.163**。逐条明细见
`docs/measurement/live-report.md`。真实账单以 provider 控制台为准，单价为估算。

## 8. 相关文件

- `app/modules/assistant/lib/cost-model.ts`（Realtime 单价）
- `app/modules/assistant/lib/chat-cost-model.ts`（Chat 单价）
- `app/modules/assistant/lib/usage-prices.ts`（价格表回显）
- `app/modules/assistant/lib/cost-calibration.ts`（校准辅助纯函数）
- `app/modules/assistant/lib/cost-calibration.test.ts`（单测）
- `app/modules/assistant/lib/calibration-report.ts`（实测报告构建）
- `app/modules/assistant/lib/calibration-report.test.ts`（单测）
- `scripts/measure-cost.mjs`（实测分析 CLI）
- `docs/measurement/`（实测示例数据 + 报告）
