import { z } from "zod";

export const chatResponseBudgetSchema = z.enum([
  "brief",
  "standard",
  "detailed",
]);

export const chatCompletionInputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  imageDataUrl: z
    .string()
    .trim()
    .startsWith("data:image/")
    .max(8_000_000)
    .optional(),
  responseBudget: chatResponseBudgetSchema.default("standard"),
  instructions: z.string().trim().min(1).max(1200).optional(),
});

export type ChatCompletionInput = z.infer<typeof chatCompletionInputSchema>;
export type ChatResponseBudget = ChatCompletionInput["responseBudget"];

export type ChatCompletionSuccessResponse = {
  success: true;
  answer: string;
  model: string;
};

export type ChatApiErrorResponse = {
  success: false;
  error: string;
  code: string;
};