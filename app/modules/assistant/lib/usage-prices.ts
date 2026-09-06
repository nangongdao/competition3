/**
 * Provider price-table mirror for in-app cost display.
 *
 * The cost conversion shown in the usage panel / global view is computed from
 * hard-coded per-million-token prices (see `cost-model.ts` for Realtime and
 * `chat-cost-model.ts` for Chat). This module normalises those price tables
 * into a display-friendly, mode-aware row list so the UI can surface the exact
 * provider prices used — making the "estimated cost" figure transparent.
 *
 * Billing truth always lives in the provider console; the prices below are
 * estimates for in-app display only.
 */

import { REALTIME_PRICES_USD_PER_MILLION } from "@/modules/assistant/lib/cost-model";
import { CHAT_PRICES_USD_PER_MILLION } from "@/modules/assistant/lib/chat-cost-model";

/** One row of the displayed provider price table. */
export type UsagePriceRow = {
  /** i18n key describing the modality (e.g. usage.priceInputText). */
  labelKey: string;
  /** USD per 1M tokens for this modality. */
  priceUsdPerMillion: number;
  /** Optional note key for cached-rate rows (price applies to cached tokens). */
  noteKey?: string;
};

/** Normalised provider price table for a given metering mode. */
export type UsagePriceTable = {
  /** Metering mode the table applies to ("realtime" | "chat"). */
  mode: "realtime" | "chat";
  rows: readonly UsagePriceRow[];
};

/** USD-per-1M-token prices for the Realtime model. */
export function buildRealtimePriceRows(): readonly UsagePriceRow[] {
  return [
    { labelKey: "usage.priceInputText", priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.inputText },
    {
      labelKey: "usage.priceCachedText",
      priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.cachedText,
      noteKey: "usage.priceCachedRate",
    },
    { labelKey: "usage.priceInputAudio", priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.inputAudio },
    {
      labelKey: "usage.priceCachedAudio",
      priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.cachedAudio,
      noteKey: "usage.priceCachedRate",
    },
    { labelKey: "usage.priceInputImage", priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.inputImage },
    {
      labelKey: "usage.priceCachedImage",
      priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.cachedImage,
      noteKey: "usage.priceCachedRate",
    },
    { labelKey: "usage.priceOutputText", priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.outputText },
    { labelKey: "usage.priceOutputAudio", priceUsdPerMillion: REALTIME_PRICES_USD_PER_MILLION.outputAudio },
  ];
}

/** USD-per-1M-token prices for the vision Chat model. */
export function buildChatPriceRows(): readonly UsagePriceRow[] {
  return [
    { labelKey: "usage.priceInputText", priceUsdPerMillion: CHAT_PRICES_USD_PER_MILLION.inputText },
    { labelKey: "usage.priceInputImage", priceUsdPerMillion: CHAT_PRICES_USD_PER_MILLION.inputImage },
    { labelKey: "usage.priceOutputText", priceUsdPerMillion: CHAT_PRICES_USD_PER_MILLION.outputText },
  ];
}

/**
 * Returns the provider price table for a metering mode.
 *
 * Pure and stable: callers receive a fresh-but-equal snapshot each invocation.
 */
export function buildPriceTable(
  mode: "realtime" | "chat",
): UsagePriceTable {
  return mode === "chat"
    ? { mode: "chat", rows: buildChatPriceRows() }
    : { mode: "realtime", rows: buildRealtimePriceRows() };
}

/** Convenience snapshot of both price tables for the global (cross-session) view. */
export function buildAllPriceTables(): readonly UsagePriceTable[] {
  return [buildPriceTable("realtime"), buildPriceTable("chat")];
}

/** Formats a per-million-token price as a stable USD string. */
export function formatPricePerMillion(priceUsdPerMillion: number): string {
  return `$${priceUsdPerMillion.toFixed(2)}/1M`;
}
