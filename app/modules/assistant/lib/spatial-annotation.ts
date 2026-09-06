/**
 * Spatial annotation (M4.3) — 空间定位标注。
 *
 * 动机：让模型不只回答"这是什么"，还能指出"在哪里"——在摄像头预览上叠加
 * 归一化坐标的标注框，强化"视觉对话"核心卖点。模型以文本方式返回一个
 * `[ANNOTATIONS] ... [/ANNOTATIONS]` 分块，内含 JSON 数组，前端解析后绘制
 * 叠加层；对不支持结构化标注的模型，仅回退为纯文本，无副作用。
 *
 * 本模块为纯函数：`parseSpatialAnnotations` 从模型回复中提取并校验标注，
 * `stripSpatialAnnotations` 剥离标注块得到干净的可展示文本，
 * `normalizeAnnotationBox` 把坐标钳制到 [0,1]。
 */

/** 归一化坐标标注框（0~1）。 */
export type NormalizedBox = {
  /** 左边缘，归一化 x（0~1）。 */
  readonly x: number;
  /** 上边缘，归一化 y（0~1）。 */
  readonly y: number;
  /** 宽度，归一化（0~1）。 */
  readonly w: number;
  /** 高度，归一化（0~1）。 */
  readonly h: number;
};

/** 空间标注：标签 + 归一化坐标框。 */
export type SpatialAnnotation = {
  readonly label: string;
  readonly box: NormalizedBox;
};

/** 标注块起始标记。 */
export const ANNOTATIONS_OPEN = "[ANNOTATIONS]";
/** 标注块结束标记。 */
export const ANNOTATIONS_CLOSE = "[/ANNOTATIONS]";
/** 标注块允许的最大字节数（防止模型输出超大 JSON 撑爆内存）。 */
export const ANNOTATIONS_MAX_BYTES = 20_000;
/** 单条回复允许的最大标注条数。 */
export const ANNOTATIONS_MAX_COUNT = 12;

/** 归一化坐标保留的小数位数（消除浮点误差）。 */
const BOX_PRECISION = 4;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function roundBox(value: number): number {
  return Number(value.toFixed(BOX_PRECISION));
}

function clampBoxWidthHeight(box: NormalizedBox): NormalizedBox {
  // 计算框在 [0,1] 视口内的可见部分：左/上边缘钳到下限，右/下边缘钳到上限。
  const left = clampUnit(box.x);
  const top = clampUnit(box.y);
  const right = clampUnit(box.x + box.w);
  const bottom = clampUnit(box.y + box.h);
  const width = right - left;
  const height = bottom - top;

  return {
    x: roundBox(left),
    y: roundBox(top),
    w: roundBox(Math.max(0, width)),
    h: roundBox(Math.max(0, height)),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBox(value: unknown): NormalizedBox | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = value.x;
  const y = value.y;
  const w = value.w;
  const h = value.h;

  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof w !== "number" ||
    typeof h !== "number"
  ) {
    return null;
  }

  return clampBoxWidthHeight({ x, y, w, h });
}

function parseAnnotation(value: unknown): SpatialAnnotation | null {
  if (!isRecord(value)) {
    return null;
  }

  const label = value.label;
  const box = parseBox(value.box);

  if (typeof label !== "string" || label.trim().length === 0 || box === null) {
    return null;
  }

  return {
    label: label.trim().slice(0, 120),
    box,
  };
}

/**
 * 从模型回复文本中提取标注块内容。
 *
 * 返回位于 `[ANNOTATIONS]` 与 `[/ANNOTATIONS]` 之间的子串；无块或格式异常
 * 返回 null。
 */
function extractAnnotationJson(text: string): string | null {
  const openIndex = text.indexOf(ANNOTATIONS_OPEN);

  if (openIndex === -1) {
    return null;
  }

  const contentStart = openIndex + ANNOTATIONS_OPEN.length;
  const closeIndex = text.indexOf(ANNOTATIONS_CLOSE, contentStart);

  if (closeIndex === -1) {
    return null;
  }

  return text.slice(contentStart, closeIndex);
}

/**
 * 解析模型回复中的空间标注。
 *
 * @param text 模型回复全文（含或不含标注块）。
 * @returns 校验通过的空间标注数组；无标注返回空数组。
 */
export function parseSpatialAnnotations(text: string): readonly SpatialAnnotation[] {
  if (typeof text !== "string" || text.trim().length === 0) {
    return [];
  }

  const jsonText = extractAnnotationJson(text);

  if (jsonText === null || jsonText.length === 0) {
    return [];
  }

  // 防止模型输出超长 JSON 导致内存/解析开销。
  if (jsonText.length > ANNOTATIONS_MAX_BYTES) {
    return [];
  }

  let value: unknown;

  try {
    value = JSON.parse(jsonText) as unknown;
  } catch {
    return [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const annotations: SpatialAnnotation[] = [];

  for (const item of value) {
    if (annotations.length >= ANNOTATIONS_MAX_COUNT) {
      break;
    }

    const parsed = parseAnnotation(item);

    if (parsed !== null) {
      annotations.push(parsed);
    }
  }

  return annotations;
}

/**
 * 剥离模型回复中的标注块，返回干净的可展示文本。
 *
 * 只移除 `[ANNOTATIONS]...[/ANNOTATIONS]` 整体（含两端换行），保留其余内容。
 * 无标注块时原样返回。
 */
export function stripSpatialAnnotations(text: string): string {
  if (typeof text !== "string" || text.trim().length === 0) {
    return text;
  }

  const openIndex = text.indexOf(ANNOTATIONS_OPEN);

  if (openIndex === -1) {
    return text;
  }

  const closeIndex = text.indexOf(ANNOTATIONS_CLOSE, openIndex);

  if (closeIndex === -1) {
    return text;
  }

  const end = closeIndex + ANNOTATIONS_CLOSE.length;
  // 移除块前后的多余空行，避免留下孤立空行。
  const before = text.slice(0, openIndex).replace(/\n+$/, "");
  const after = text.slice(end).replace(/^\n+/, "");

  const joined = [before, after].filter((part) => part.length > 0).join("\n");

  return joined.length > 0 ? joined : "";
}

/**
 * 判断回复文本是否包含可解析的空间标注块。
 *
 * 便捷判断，避免重复解析。
 */
export function hasSpatialAnnotations(text: string): boolean {
  return parseSpatialAnnotations(text).length > 0;
}

/**
 * 便捷工具：把解析出的标注转为叠加层期望的像素坐标。
 *
 * @param annotation 归一化标注。
 * @param width 视频容器像素宽度。
 * @param height 视频容器像素高度。
 */
export function annotationToPixels(
  annotation: SpatialAnnotation,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const safeWidth = width > 0 ? width : 1;
  const safeHeight = height > 0 ? height : 1;

  return {
    left: annotation.box.x * safeWidth,
    top: annotation.box.y * safeHeight,
    width: annotation.box.w * safeWidth,
    height: annotation.box.h * safeHeight,
  };
}
