import { z } from "zod";

export const providerModeSchema = z.enum(["chat", "realtime"]);

export type ProviderMode = z.infer<typeof providerModeSchema>;

export type ProviderConfigResponse = {
  success: true;
  providerMode: ProviderMode;
};