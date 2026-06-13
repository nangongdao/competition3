import { Hono } from "hono";

import type { AppEnv } from "../../types";
import {
  providerModeSchema,
  type ProviderConfigResponse,
  type ProviderMode,
} from "./types";

const DEFAULT_PROVIDER_MODE: ProviderMode = "chat";

export const providerRoutes = new Hono<AppEnv>();

providerRoutes.get("/config", (c) => {
  const providerMode = resolveProviderMode(c.env.OPENAI_PROVIDER_MODE);
  const response: ProviderConfigResponse = {
    success: true,
    providerMode,
  };

  return c.json(response);
});

function resolveProviderMode(value: string | undefined): ProviderMode {
  const parseResult = providerModeSchema.safeParse(value);

  return parseResult.success ? parseResult.data : DEFAULT_PROVIDER_MODE;
}