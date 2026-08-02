# competition3 性能与能力升级方案

> 配套文档：`UPGRADE_PLAN.md`（安全与工程质量）
> 本文档专注**性能提升**与**能力进阶**。
> 审计日期：2026-08-01

---

## 0. 为什么需要这份文档

`UPGRADE_PLAN.md` 解决的是"能不能部署、会不会被刷爆额度"——那是生存问题。
本文档解决的是"跑得快不快、功能够不够高级"——这是竞争力问题。

本项目在成本优化上已有真实创新（帧差分、历史剪枝），
**这份文档的任务是把这个优势做深，并补上视觉理解能力的短板**。

---

## 1. 【P0】帧采样阻塞主线程

### 1.1 问题

`app/modules/assistant/components/assistant-workspace.tsx:659-677`
在**主线程同步执行**三个重操作：

```ts
context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

signature = createFrameSignatureFromImageData(
  context.getImageData(0, 0, canvasElement.width, canvasElement.height),  // ← 同步读回像素
);

const frameDataUrl = canvasElement.toDataURL("image/jpeg", 0.72);        // ← 同步编码
```

**`getImageData` 会强制 GPU→CPU 同步回读**，`toDataURL` 会同步执行 JPEG 编码
并生成 base64 字符串。640×360 分辨率下这套组合约耗时 **15–40ms**，
自动采样模式下每次采样都会造成一次可感知的掉帧。

> 已做对的部分：`maxFrameWidth = 640` 的降采样（`:644`）与
> JPEG 质量 0.72（`:677`）都是合理选择，不需要改。

### 1.2 改造：OffscreenCanvas + Worker

```ts
// app/modules/assistant/workers/frame-processor.worker.ts

/**
 * 帧处理 Worker。
 *
 * 在独立线程完成像素读回、签名计算与 JPEG 编码，
 * 避免 getImageData/toDataURL 阻塞主线程渲染。
 */

import { createFrameSignatureFromImageData } from "../modules/assistant/lib/frame-diff";

type ProcessRequest = {
  bitmap: ImageBitmap;
  maxWidth: number;
  quality: number;
};

self.onmessage = async (event: MessageEvent<ProcessRequest>) => {
  const { bitmap, maxWidth, quality } = event.data;

  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  if (!context) {
    self.postMessage({ error: "无法创建 2D 上下文" });
    bitmap.close();
    return;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const signature = createFrameSignatureFromImageData(
    context.getImageData(0, 0, width, height),
  );

  // convertToBlob 是异步的，不阻塞
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  const buffer = await blob.arrayBuffer();

  self.postMessage({ signature, buffer, width, height }, [buffer]);
};
```

主线程侧：

```ts
/**
 * 采样一帧并在 Worker 中处理。
 *
 * createImageBitmap 从 video 元素零拷贝取帧，
 * 转移到 Worker 后主线程立即释放。
 */
async function sampleFrameOffThread(
  video: HTMLVideoElement,
): Promise<{ dataUrl: string; signature: FrameSignature } | null> {
  const bitmap = await createImageBitmap(video);

  return new Promise((resolve) => {
    frameWorker.onmessage = (event) => {
      if (event.data.error) {
        resolve(null);
        return;
      }
      const { signature, buffer } = event.data;
      const base64 = arrayBufferToBase64(buffer);
      resolve({ dataUrl: `data:image/jpeg;base64,${base64}`, signature });
    };

    frameWorker.postMessage(
      { bitmap, maxWidth: 640, quality: 0.72 },
      [bitmap],   // 转移所有权，零拷贝
    );
  });
}
```

**收益**：主线程采样耗时从 15–40ms 降到 **<2ms**（仅 `createImageBitmap` 调用），
自动采样时不再掉帧。

---

## 2. 【P0】帧差分算法升级 —— 当前会漏检也会误触发

### 2.1 问题

`app/modules/assistant/lib/frame-diff.ts:1-3`：

```ts
export const FRAME_DIFF_GRID_WIDTH = 32;
export const FRAME_DIFF_GRID_HEIGHT = 18;
export const FRAME_DIFF_SEND_THRESHOLD = 0.04;
```

算法是 32×18 网格的**亮度均值差**。这个设计简单有效，但有两个缺陷：

**缺陷 1：漏检局部小变化**
用户举起一个小物体（占画面 5%），在 32×18 网格里只影响 1–2 个格子。
即使这些格子亮度剧变，**全局平均差异被稀释到阈值以下** —— 帧不会上传，
用户问"这是什么"时模型看到的还是旧画面。

**缺陷 2：误触发于全局光照变化**
云层遮挡阳光、有人开关灯 —— 整个画面亮度均匀偏移，
差异值超过 0.04 触发上传，但**画面内容毫无变化**，白白花钱。

### 2.2 改造：三层判定

```ts
// app/modules/assistant/lib/frame-diff.ts

/** 局部变化判定：单格差异超过该值即视为显著局部变化。 */
export const FRAME_DIFF_LOCAL_THRESHOLD = 0.22;
/** 触发上传所需的显著变化格子数下限。 */
export const FRAME_DIFF_MIN_CHANGED_CELLS = 3;
/** 全局亮度偏移容忍度：低于该值的均匀偏移视为光照变化，不触发。 */
export const FRAME_DIFF_ILLUMINATION_TOLERANCE = 0.06;

export type FrameDiffResult = {
  /** 是否应发送该帧 */
  readonly shouldSend: boolean;
  /** 全局平均差异 */
  readonly globalDiff: number;
  /** 显著变化的格子数 */
  readonly changedCells: number;
  /** 判定依据，用于 UI 展示与调试 */
  readonly reason: "local-change" | "global-change" | "illumination-only" | "static";
};

/**
 * 比较两帧签名，判断是否需要上传。
 *
 * 三层判定：
 *   1. 先剔除全局亮度偏移（光照变化不代表内容变化）
 *   2. 局部显著变化 ≥ N 格 → 发送（捕捉小物体出现）
 *   3. 补偿后的全局差异超阈值 → 发送（捕捉场景切换）
 *
 * @param previous 上一帧签名
 * @param current 当前帧签名
 * @returns 判定结果与依据
 */
export function compareFrameSignatures(
  previous: FrameSignature,
  current: FrameSignature,
): FrameDiffResult {
  if (previous.luma.length !== current.luma.length) {
    return { shouldSend: true, globalDiff: 1, changedCells: 0, reason: "global-change" };
  }

  const diffs = current.luma.map((value, index) => value - previous.luma[index]!);

  // 1. 估计全局亮度偏移（中位数比均值更抗局部剧变干扰）
  const sorted = [...diffs].sort((a, b) => a - b);
  const illuminationShift = sorted[Math.floor(sorted.length / 2)] ?? 0;

  // 2. 补偿后的差异 = 剔除光照影响的真实内容变化
  const compensated = diffs.map((d) => Math.abs(d - illuminationShift));

  const changedCells = compensated.filter(
    (d) => d > FRAME_DIFF_LOCAL_THRESHOLD,
  ).length;

  const globalDiff =
    compensated.reduce((sum, d) => sum + d, 0) / compensated.length;

  // 3. 局部显著变化优先判定（解决小物体漏检）
  if (changedCells >= FRAME_DIFF_MIN_CHANGED_CELLS) {
    return { shouldSend: true, globalDiff, changedCells, reason: "local-change" };
  }

  if (globalDiff > FRAME_DIFF_SEND_THRESHOLD) {
    return { shouldSend: true, globalDiff, changedCells, reason: "global-change" };
  }

  // 补偿前超阈值但补偿后不超 → 纯光照变化，省掉这次上传
  const rawGlobalDiff =
    diffs.reduce((sum, d) => sum + Math.abs(d), 0) / diffs.length;
  if (rawGlobalDiff > FRAME_DIFF_SEND_THRESHOLD) {
    return { shouldSend: false, globalDiff, changedCells, reason: "illumination-only" };
  }

  return { shouldSend: false, globalDiff, changedCells, reason: "static" };
}
```

**收益**：
- 小物体出现的检出率大幅提升（从"基本漏检"到"3 格即触发"）
- 光照变化不再误触发，进一步省成本
- `reason` 字段可直接在 UI 展示（"已跳过：仅光照变化"），
  **让成本优化从"数字"变成"看得见的智能"** —— 答辩加分项

### 2.3 提高网格分辨率

32×18 = 576 格对 640×360 的图像来说每格 20×20 像素，粒度偏粗。
建议提到 48×27（1296 格，每格 13×13 像素），计算量仍可忽略（Worker 中执行）。

---

## 3. 【P1】视觉理解能力 —— 项目最大的能力短板

### 3.1 问题

`wrangler.toml:26` 的默认配置：

```toml
OPENAI_CHAT_VISION_INPUT = "disabled"
```

一个叫"AI **视觉**对话助手"的项目，**默认配置下视觉能力是关的**。
评委按 README 跑起来，看到的是一个普通聊天机器人。

### 3.2 改造：视觉能力分级 + 自动探测

```ts
// src/worker/lib/vision-capability.ts

/** 模型的视觉能力等级。 */
export type VisionCapability = "none" | "single-image" | "multi-image";

/** 已知模型的视觉能力表。 */
const KNOWN_VISION_MODELS: Record<string, VisionCapability> = {
  "gpt-4o": "multi-image",
  "gpt-4o-mini": "multi-image",
  "Qwen/Qwen2.5-VL-72B-Instruct": "multi-image",
  "Qwen/Qwen2-VL-7B-Instruct": "single-image",
  "nex-agi/Nex-N2-Pro": "none",
};

/**
 * 解析模型的视觉能力。
 *
 * 优先查已知模型表，未知模型按配置的显式声明处理，
 * 都没有则保守返回 none。
 */
export function resolveVisionCapability(
  model: string,
  explicitMode: string | undefined,
): VisionCapability {
  if (explicitMode === "enabled") return "multi-image";
  if (explicitMode === "disabled") return "none";
  return KNOWN_VISION_MODELS[model] ?? "none";
}
```

**并在 UI 中明确展示当前能力**：

```tsx
{visionCapability === "none" && (
  <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
    当前模型（{model}）不支持视觉输入。
    切换到支持视觉的模型即可开启画面理解能力。
    <a href="#" onClick={openModelPicker}>推荐配置 →</a>
  </div>
)}
```

**这比默默关闭视觉功能好得多** —— 用户知道为什么、也知道怎么开。

### 3.3 README 提供开箱即用的视觉配置

```toml
# 推荐配置（支持视觉）
OPENAI_BASE_URL = "https://api.siliconflow.cn/v1"
OPENAI_CHAT_MODEL = "Qwen/Qwen2.5-VL-72B-Instruct"
OPENAI_CHAT_VISION_INPUT = "enabled"
```

---

## 4. 【P1】成本模型精确化

### 4.1 问题

`cost-model.ts`（394 行）目前基于 Realtime 的 `response.done` usage 事件统计。
但**图像 token 的计算没有体现分块规则**。

OpenAI 兼容 API 的视觉 token 计算方式（以 GPT-4o 为例）：

```
base_tokens = 85
tile_tokens = 170 × ceil(width/512) × ceil(height/512)
total = base_tokens + tile_tokens
```

640×360 的帧 → `ceil(640/512)=2`, `ceil(360/512)=1` → 85 + 340 = **425 token/帧**。

### 4.2 改造：分辨率感知的成本预估

```ts
// app/modules/assistant/lib/cost-model.ts

/** 视觉 token 计算参数（OpenAI 兼容规范）。 */
const VISION_BASE_TOKENS = 85;
const VISION_TILE_TOKENS = 170;
const VISION_TILE_SIZE = 512;

/**
 * 估算一张图片消耗的 input token。
 *
 * @param width 图片宽度（像素）
 * @param height 图片高度（像素）
 * @returns 预估 token 数
 */
export function estimateImageTokens(width: number, height: number): number {
  const tilesX = Math.ceil(width / VISION_TILE_SIZE);
  const tilesY = Math.ceil(height / VISION_TILE_SIZE);
  return VISION_BASE_TOKENS + VISION_TILE_TOKENS * tilesX * tilesY;
}

/**
 * 计算不同分辨率下的成本，用于向用户展示降分辨率的收益。
 */
export function compareResolutionCosts(
  sourceWidth: number,
  sourceHeight: number,
): readonly { width: number; tokens: number; savingPercent: number }[] {
  const candidates = [1280, 1024, 768, 640, 512];
  const baseline = estimateImageTokens(sourceWidth, sourceHeight);

  return candidates.map((width) => {
    const scale = width / sourceWidth;
    const height = Math.round(sourceHeight * scale);
    const tokens = estimateImageTokens(width, height);
    return {
      width,
      tokens,
      savingPercent: Math.round((1 - tokens / baseline) * 100),
    };
  });
}
```

**关键洞察**：640×360 与 512×288 都是 `2×1` 和 `1×1` 分块 ——
**从 640 降到 512 能省 40% 的图像 token**（425 → 255），画质损失却很小。
这个发现值得在 UI 中展示为一个"经济模式"开关。

### 4.3 UI 展示实时成本

```tsx
<div className="text-xs text-slate-500">
  本次会话：{sentFrames} 帧已发送 / {skippedFrames} 帧已跳过
  <span className="ml-2 text-emerald-600">
    帧差分节省 ≈ {estimatedSavings.toFixed(3)} 元
  </span>
</div>
```

把"跳过了多少帧"翻译成"省了多少钱"——**评委对钱的感知远强于对数字的感知**。

---

## 5. 【P2】能力进阶

### 5.1 视觉记忆与场景理解 ★★★★★

当前每帧独立发送，模型没有"场景连续性"概念。

**改进：关键帧 + 场景摘要**

```ts
/** 场景记忆条目。 */
export type SceneMemory = {
  readonly frameDataUrl: string;
  readonly timestamp: number;
  /** 模型对该帧的一句话描述，用于后续轮次的低成本上下文 */
  readonly description: string;
};

/**
 * 场景记忆管理器。
 *
 * 保留最近 N 个关键帧的文字描述而非图片本身，
 * 让模型在不重复消耗图像 token 的前提下保持场景连续性。
 */
export class SceneMemoryStore {
  private readonly memories: SceneMemory[] = [];
  private readonly maxEntries = 5;

  /**
   * 构造场景上下文提示。
   *
   * 用文字描述代替历史图片，成本从 425 token/帧 降到约 30 token/帧。
   */
  buildContextPrompt(): string {
    if (this.memories.length === 0) return "";

    const lines = this.memories.map(
      (m, i) => `${i + 1}. ${formatRelativeTime(m.timestamp)}：${m.description}`,
    );
    return `画面变化历史（供参考，当前画面以最新图片为准）：\n${lines.join("\n")}`;
  }
}
```

**收益**：5 轮对话的图像成本从 2125 token 降到 425 + 150 = 575 token，
**降低 73%**，同时保持了场景连续性。这是对现有 `frame-pruning` 思路的自然延伸。

### 5.2 视觉问答的空间定位 ★★★★☆

让模型不只回答"这是什么"，还能指出"在哪里"：

```ts
/** 模型返回的空间标注。 */
export type SpatialAnnotation = {
  readonly label: string;
  /** 归一化坐标 [0,1] */
  readonly box: { x: number; y: number; width: number; height: number };
};
```

在摄像头预览上叠加标注框。**视觉效果极强，答辩现场冲击力大**。

### 5.3 多模态输入融合 ★★★☆☆

当前语音、文本、画面是三条独立路径。可以融合：

```ts
/**
 * 融合多模态输入为单次请求。
 *
 * 用户说话的同时画面变化 → 合并为一次调用，
 * 而非语音一次、画面一次，减少 API 往返与成本。
 */
export function buildMultimodalTurn(
  transcript: string,
  frame: FrameSample | null,
  sceneContext: string,
): ChatMessage[] {
  // ...
}
```

### 5.4 离线降级能力 ★★★☆☆

弱网或 API 不可用时，浏览器原生能力可提供基础功能：

```ts
/**
 * 降级策略。
 *
 * Worker 不可达时回退到浏览器原生 SpeechRecognition，
 * 至少保证转写功能可用（虽然没有 AI 回答）。
 */
```

项目已有 `use-browser-speech-adapter.ts` —— **这个降级路径已经存在，
只是没有被明确定位成"离线降级"**。建议在 UI 中明示，
把它从"冗余代码"变成"可靠性设计"。

---

## 6. 【P2】前端渲染性能

### 6.1 巨型组件的渲染代价

`assistant-workspace.tsx` 的 18 个 `useState` 集中在顶层组件，
**任何一个状态变化都会重渲染整棵子树**。

自动采样每 8 秒触发一次，会连带更新 `sampledFrameCount`、
`sentFrameCount`、`lastFrameDataUrl` 三个状态 —— 触发 3 次全量重渲染。

**改进**（配合 `UPGRADE_PLAN.md` 的 ARCH-01 拆分）：

```ts
// 合并为单次状态更新，减少重渲染次数
dispatch({ type: "frame-sampled", dataUrl, sent: shouldSend });
```

并对纯展示子组件加 `memo`：

```tsx
export const TranscriptList = memo(function TranscriptList({ entries }: Props) {
  // ...
});
```

### 6.2 转写列表虚拟化

长会话的转写记录会累积到数百条。`transcript-list.tsx`（275 行）
若全量渲染会逐渐卡顿，建议同样引入虚拟滚动。

---

## 7. 性能基线与验收

| 指标 | 当前 | 目标 | 验证方式 |
|---|---|---|---|
| 主线程采样耗时 | 15–40ms | **< 2ms** | Performance 面板 |
| 小物体变化检出率 | 低（会漏检） | ≥ 90% | 人工测试集 |
| 光照变化误触发率 | 高 | ≤ 5% | 人工测试集 |
| 5 轮对话图像 token | 2125 | **≤ 600** | token 计数 |
| 单帧图像 token（512px） | 425 | 255 | 计算验证 |
| 自动采样时的掉帧 | 可见 | 无 | 帧率监控 |
| 300 条转写渲染帧率 | 未测 | ≥ 55 FPS | Performance 面板 |

建议新增性能测试：

```ts
// app/modules/assistant/lib/frame-diff.test.ts

describe("帧差分 — 局部变化检出", () => {
  it("画面 5% 区域剧变应触发发送", () => {
    const before = buildUniformSignature(0.5);
    const after = mutateCells(before, { count: 4, delta: 0.4 });

    const result = compareFrameSignatures(before, after);
    expect(result.shouldSend).toBe(true);
    expect(result.reason).toBe("local-change");
  });

  it("全局均匀亮度偏移不应触发发送", () => {
    const before = buildRandomSignature();
    const after = shiftAllCells(before, 0.08);   // 整体变亮

    const result = compareFrameSignatures(before, after);
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe("illumination-only");
  });
});
```

---

## 8. 实施优先级

| 优先级 | 任务 | 工期 | 收益 |
|---|---|---|---|
| **P0** | §2 帧差分三层判定 | 1 天 | **修复漏检 + 消除误触发，直接提升核心卖点质量** |
| P0 | §1 帧处理移入 Worker | 1 天 | 消除采样掉帧 |
| **P1** | §3 视觉能力分级 + 默认配置 | 半天 | **让项目的核心卖点默认可见** |
| P1 | §4 成本模型精确化 + UI 展示 | 1 天 | 把优化成果可视化为"省了多少钱" |
| **P2** | §5.1 场景记忆 | 2 天 | **图像成本再降 73%，是现有思路的自然延伸** |
| P2 | §6.1 状态合并 + memo | 1 天 | 减少无效重渲染 |
| P3 | §5.2 空间定位标注 | 2–3 天 | 答辩视觉冲击力 |
| P3 | §6.2 转写虚拟化 | 半天 | 长会话不卡顿 |

**如果只做两件事**：§2（帧差分升级）+ §3（视觉能力默认开启）。
前者让核心技术真正靠谱，后者让评委**看得见**这个核心技术。

---

## 附录：数据推导方式

**§1 的耗时估算**基于 `getImageData`（GPU→CPU 同步回读，640×360 约 5–15ms）
与 `toDataURL`（JPEG 编码 + base64，约 10–25ms）的典型开销。
实际值需用 `performance.mark` 在目标设备上测量。

**§4.2 的 token 数**按 OpenAI 视觉 token 规范计算：
```
640×360 → ceil(640/512)=2, ceil(360/512)=1 → 85 + 170×2×1 = 425
512×288 → ceil(512/512)=1, ceil(288/512)=1 → 85 + 170×1×1 = 255
节省 = (425-255)/425 = 40%
```
不同供应商的分块规则可能不同，接入后需用实际 usage 回执校准。

**§5.1 的降幅**：5 轮对话中，若每轮都发新图 = 5×425 = 2125 token；
改为只发当前帧 + 4 条文字描述（每条约 30 token）= 425 + 120 = 545 token，
降幅 74%。

*本方案基于 2026-08-01 的代码状态。*
