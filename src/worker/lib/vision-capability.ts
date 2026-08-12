/** 模型的视觉能力等级。 */
export type VisionCapability = "none" | "single-image" | "multi-image";

/** 已知模型的视觉能力表。 */
export const KNOWN_VISION_MODELS: Readonly<Record<string, VisionCapability>> = {
  "gpt-4o": "multi-image",
  "gpt-4o-mini": "multi-image",
  "Qwen/Qwen2.5-VL-72B-Instruct": "multi-image",
  "Qwen/Qwen2-VL-7B-Instruct": "single-image",
  "nex-agi/Nex-N2-Pro": "none",
};

/**
 * 解析模型的视觉能力。
 *
 * 优先按配置的显式声明处理（enabled/disabled），
 * 未知模型查已知模型表，都没有则保守返回 none。
 */
export function resolveVisionCapability(
  model: string | undefined,
  explicitMode: string | undefined,
): VisionCapability {
  if (explicitMode === "enabled") {
    return "multi-image";
  }

  if (explicitMode === "disabled") {
    return "none";
  }

  const normalizedModel = model?.trim();

  if (normalizedModel === undefined || normalizedModel.length === 0) {
    return "none";
  }

  return KNOWN_VISION_MODELS[normalizedModel] ?? "none";
}
