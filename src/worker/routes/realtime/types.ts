import { z } from "zod";

export const realtimeSessionInputSchema = z.object({
  instructions: z.string().trim().min(1).max(1200).optional(),
  visualContextMode: z.enum(["manual", "interval"]).default("manual"),
});

export type RealtimeSessionInput = z.infer<typeof realtimeSessionInputSchema>;

export type RealtimeCostPolicy = {
  visualContextMode: RealtimeSessionInput["visualContextMode"];
  maxSessionSeconds: number;
  frameUpload: "manual-or-interval";
};

export type RealtimeSessionSuccessResponse = {
  success: true;
  session: unknown;
  costPolicy: RealtimeCostPolicy;
};

export type ApiErrorResponse = {
  success: false;
  error: string;
  code: string;
};
