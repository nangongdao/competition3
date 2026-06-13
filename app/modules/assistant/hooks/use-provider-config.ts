import { useCallback, useEffect, useState } from "react";

import { isRecord } from "@/modules/assistant/lib/type-guards";
import type {
  ProviderConfigResponse,
  ProviderMode,
} from "../../../../src/worker/routes/provider/types";

type ProviderConfigState = {
  providerMode: ProviderMode;
  isLoading: boolean;
  errorMessage?: string;
};

type UseProviderConfigResult = {
  providerMode: ProviderMode;
  isProviderConfigLoading: boolean;
  providerConfigError?: string;
  setProviderMode: (providerMode: ProviderMode) => void;
};

function isProviderConfigResponse(value: unknown): value is ProviderConfigResponse {
  return (
    isRecord(value) &&
    value.success === true &&
    (value.providerMode === "chat" || value.providerMode === "realtime")
  );
}

export function useProviderConfig(): UseProviderConfigResult {
  const [state, setState] = useState<ProviderConfigState>({
    providerMode: "chat",
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
    isProviderConfigLoading: state.isLoading,
    providerConfigError: state.errorMessage,
    setProviderMode,
  };
}