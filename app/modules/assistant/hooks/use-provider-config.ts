import { useCallback, useEffect, useState } from "react";

import { isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  ProviderConfigResponse,
  ProviderMode,
  VisionCapability,
} from "../../../../src/worker/routes/provider/types";

type ProviderConfigState = {
  providerMode: ProviderMode;
  visionCapability: VisionCapability;
  isLoading: boolean;
  errorMessage?: string;
};

type UseProviderConfigResult = {
  providerMode: ProviderMode;
  visionCapability: VisionCapability;
  isProviderConfigLoading: boolean;
  providerConfigError?: string;
  setProviderMode: (providerMode: ProviderMode) => void;
};

function isVisionCapability(value: unknown): value is VisionCapability {
  return value === "none" || value === "single-image" || value === "multi-image";
}

function isProviderConfigResponse(value: unknown): value is ProviderConfigResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    (value.providerMode === "chat" || value.providerMode === "realtime")
  );
}

const DEFAULT_VISION_CAPABILITY: VisionCapability = "none";

export function useProviderConfig(): UseProviderConfigResult {
  const [state, setState] = useState<ProviderConfigState>({
    providerMode: "chat",
    visionCapability: DEFAULT_VISION_CAPABILITY,
    isLoading: true,
  });

  useEffect(() => {
    let isActive = true;

    async function loadConfig(): Promise<void> {
      try {
        const response = await fetch("/api/provider/config");

        if (!response.ok) {
          throw new Error(`Provider config request failed: ${response.status}`);
        }

        const value = (await response.json()) as unknown;

        if (!isProviderConfigResponse(value)) {
          throw new Error("Provider config response does not match the expected contract.");
        }

        if (isActive) {
          setState({
            providerMode: value.providerMode,
            visionCapability: isVisionCapability(value.visionCapability)
              ? value.visionCapability
              : DEFAULT_VISION_CAPABILITY,
            isLoading: false,
          });
        }
      } catch (error: unknown) {
        if (!isActive) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: false,
          errorMessage:
            error instanceof Error
              ? error.message
              : "Provider config request failed.",
        }));
      }
    }

    void loadConfig();

    return () => {
      isActive = false;
    };
  }, []);

  const setProviderMode = useCallback((providerMode: ProviderMode): void => {
    setState((current) => ({
      ...current,
      providerMode,
    }));
  }, []);

  return {
    providerMode: state.providerMode,
    visionCapability: state.visionCapability,
    isProviderConfigLoading: state.isLoading,
    providerConfigError: state.errorMessage,
    setProviderMode,
  };
}
