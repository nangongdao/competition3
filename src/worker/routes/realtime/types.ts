import { z } from "zod";

export const realtimeTurnDetectionModeSchema = z.enum([
  "server-vad",
  "push-to-talk",
]);

export const realtimeResponseBudgetSchema = z.enum([
  "brief",
  "standard",
  "detailed",
]);

export const realtimeSessionInputSchema = z.object({
  instructions: z.string().trim().min(1).max(1200).optional(),
  visualContextMode: z.enum(["manual", "interval"]).default("manual"),
  turnDetectionMode: realtimeTurnDetectionModeSchema.default("server-vad"),
  responseBudget: realtimeResponseBudgetSchema.default("standard"),
});

export type RealtimeSessionInput = z.infer<typeof realtimeSessionInputSchema>;
export type RealtimeTurnDetectionMode = RealtimeSessionInput["turnDetectionMode"];
export type RealtimeResponseBudget = RealtimeSessionInput["responseBudget"];

export type RealtimeCostPolicy = {
  visualContextMode: RealtimeSessionInput["visualContextMode"];
  turnDetectionMode: RealtimeTurnDetectionMode;
  responseBudget: RealtimeResponseBudget;
  maxResponseOutputTokens: number;
  maxSessionSeconds: number;
  frameUpload: "manual-or-interval";
};

export type RealtimeSessionSuccessResponse = {
  success: true;
  session: unknown;
  webrtcUrl: string;
  costPolicy: RealtimeCostPolicy;
};

export type ApiErrorResponse = {
  success: false;
  error: string;
  code: string;
};
