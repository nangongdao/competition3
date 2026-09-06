import { describe, expect, it } from "vitest";

import {
  buildAllPriceTables,
  buildChatPriceRows,
  buildPriceTable,
  buildRealtimePriceRows,
  formatPricePerMillion,
} from "./usage-prices";
import { REALTIME_PRICES_USD_PER_MILLION } from "./cost-model";
import { CHAT_PRICES_USD_PER_MILLION } from "./chat-cost-model";

describe("buildRealtimePriceRows", () => {
  it("mirrors every Realtime price table entry as a display row", () => {
    const rows = buildRealtimePriceRows();
    const labels = new Set(rows.map((r) => r.labelKey));

    // 每个模态对应一行。
    expect(rows).toHaveLength(8);
    expect(labels).toEqual(
      new Set([
        "usage.priceInputText",
        "usage.priceCachedText",
        "usage.priceInputAudio",
        "usage.priceCachedAudio",
        "usage.priceInputImage",
        "usage.priceCachedImage",
        "usage.priceOutputText",
        "usage.priceOutputAudio",
      ]),
    );

    // 数值与源价格表一致。
    const inputText = rows.find((r) => r.labelKey === "usage.priceInputText");
    expect(inputText?.priceUsdPerMillion).toBe(
      REALTIME_PRICES_USD_PER_MILLION.inputText,
    );
    const outputAudio = rows.find((r) => r.labelKey === "usage.priceOutputAudio");
    expect(outputAudio?.priceUsdPerMillion).toBe(
      REALTIME_PRICES_USD_PER_MILLION.outputAudio,
    );
  });

  it("marks cached-rate rows with a cached-rate note key", () => {
    const cachedText = buildRealtimePriceRows().find(
      (r) => r.labelKey === "usage.priceCachedText",
    );
    expect(cachedText?.noteKey).toBe("usage.priceCachedRate");
    const inputText = buildRealtimePriceRows().find(
      (r) => r.labelKey === "usage.priceInputText",
    );
    expect(inputText?.noteKey).toBeUndefined();
  });
});

describe("buildChatPriceRows", () => {
  it("mirrors every Chat price table entry as a display row", () => {
    const rows = buildChatPriceRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.labelKey)).toEqual([
      "usage.priceInputText",
      "usage.priceInputImage",
      "usage.priceOutputText",
    ]);

    const outputText = rows.find((r) => r.labelKey === "usage.priceOutputText");
    expect(outputText?.priceUsdPerMillion).toBe(
      CHAT_PRICES_USD_PER_MILLION.outputText,
    );
  });
});

describe("buildPriceTable", () => {
  it("returns the Realtime table for realtime mode", () => {
    const table = buildPriceTable("realtime");
    expect(table.mode).toBe("realtime");
    expect(table.rows).toEqual(buildRealtimePriceRows());
  });

  it("returns the Chat table for chat mode", () => {
    const table = buildPriceTable("chat");
    expect(table.mode).toBe("chat");
    expect(table.rows).toEqual(buildChatPriceRows());
  });
});

describe("buildAllPriceTables", () => {
  it("exposes both realtime and chat tables in a stable order", () => {
    const tables = buildAllPriceTables();
    expect(tables.map((t) => t.mode)).toEqual(["realtime", "chat"]);
  });
});

describe("formatPricePerMillion", () => {
  it("formats a per-million price as USD/1M", () => {
    expect(formatPricePerMillion(2.5)).toBe("$2.50/1M");
    expect(formatPricePerMillion(64)).toBe("$64.00/1M");
    expect(formatPricePerMillion(0.4)).toBe("$0.40/1M");
  });
});
