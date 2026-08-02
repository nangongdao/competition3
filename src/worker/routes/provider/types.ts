import { z } from "zod";

import type { VisionCapability } from "../../lib/vision-capability";

export const providerModeSchema = z.enum(["chat", "realtime"]);

export type ProviderMode = z.infer<typeof providerModeSchema>;

export const visionCapabilitySchema = z.enum([
  "none",
  "single-image",
  "multi-image",
]);

export type { VisionCapability } from "../../lib/vision-capability";

export type ProviderConfigResponse = {
  success: true;
  providerMode: ProviderMode;
  /**
   * 当前 Chat 模型是否支持视觉输入。
   *
   * 前端据此提示用户切换模型以开启画面理解，避免"视觉助手但视觉关闭"的困惑。
   */
  visionCapability: VisionCapability;
};