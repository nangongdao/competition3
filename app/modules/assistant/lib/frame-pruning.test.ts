import { describe, expect, it } from "vitest";

import {
  beginResponse,
  buildFramePruneEvent,
  completeResponse,
  createFramePruneTracker,
  FRAME_PRUNE_EVENT_PREFIX,
  getCreatedImageItemId,
  isFramePruneError,
  trackCreatedFrame,
} from "./frame-pruning";

function buildItemCreatedEvent(
  itemId: string,
  content: unknown,
): Record<string, unknown> {
  return {
    type: "conversation.item.created",
    item: {
      id: itemId,
      type: "message",
      role: "user",
      content,
    },
  };
}

describe("getCreatedImageItemId", () => {
  it("returns the item id for created items with an image part", () => {
    const event = buildItemCreatedEvent("item_1", [
      { type: "input_text", text: "What is this?" },
      { type: "input_image", image_url: "data:image/jpeg;base64,abc" },
    ]);

    expect(getCreatedImageItemId(event)).toBe("item_1");
  });

  it("ignores text-only and audio items", () => {
    const textEvent = buildItemCreatedEvent("item_2", [
      { type: "input_text", text: "hello" },
    ]);
    const audioEvent = buildItemCreatedEvent("item_3", [
      { type: "input_audio", audio: "..." },
    ]);

    expect(getCreatedImageItemId(textEvent)).toBeNull();
    expect(getCreatedImageItemId(audioEvent)).toBeNull();
  });

  it("ignores other event types and malformed items", () => {
    expect(
      getCreatedImageItemId({ type: "response.done", item: { id: "x" } }),
    ).toBeNull();
    expect(
      getCreatedImageItemId({ type: "conversation.item.created" }),
    ).toBeNull();
    expect(
      getCreatedImageItemId(
        buildItemCreatedEvent("item_4", "not-an-array"),
      ),
    ).toBeNull();
    expect(
      getCreatedImageItemId({
        type: "conversation.item.created",
        item: {
          content: [{ type: "input_image", image_url: "data:image/png;base64,x" }],
        },
      }),
    ).toBeNull();
  });
});

describe("frame prune tracker", () => {
  it("moves frames pending -> in-flight -> consumed", () => {
    let tracker = createFramePruneTracker();
    tracker = trackCreatedFrame(tracker, "item_a");
    tracker = trackCreatedFrame(tracker, "item_b");

    expect(tracker.pendingItemIds).toEqual(["item_a", "item_b"]);

    tracker = beginResponse(tracker);

    expect(tracker.pendingItemIds).toEqual([]);
    expect(tracker.inFlightItemIds).toEqual(["item_a", "item_b"]);

    const { tracker: finished, consumedItemIds } = completeResponse(tracker);

    expect(consumedItemIds).toEqual(["item_a", "item_b"]);
    expect(finished.inFlightItemIds).toEqual([]);
  });

  it("keeps frames sampled mid-response pending for the next response", () => {
    let tracker = createFramePruneTracker();
    tracker = trackCreatedFrame(tracker, "item_a");
    tracker = beginResponse(tracker);

    // Frame arrives while the response is still streaming.
    tracker = trackCreatedFrame(tracker, "item_b");

    const first = completeResponse(tracker);

    expect(first.consumedItemIds).toEqual(["item_a"]);
    expect(first.tracker.pendingItemIds).toEqual(["item_b"]);

    const second = completeResponse(beginResponse(first.tracker));

    expect(second.consumedItemIds).toEqual(["item_b"]);
  });

  it("deduplicates repeated created confirmations", () => {
    let tracker = createFramePruneTracker();
    tracker = trackCreatedFrame(tracker, "item_a");
    tracker = trackCreatedFrame(tracker, "item_a");

    expect(tracker.pendingItemIds).toEqual(["item_a"]);

    tracker = beginResponse(tracker);
    tracker = trackCreatedFrame(tracker, "item_a");

    expect(tracker.pendingItemIds).toEqual([]);
    expect(tracker.inFlightItemIds).toEqual(["item_a"]);
  });

  it("returns no consumed ids when nothing is in flight", () => {
    const tracker = createFramePruneTracker();
    const { consumedItemIds } = completeResponse(tracker);

    expect(consumedItemIds).toEqual([]);
  });
});

describe("buildFramePruneEvent", () => {
  it("builds a tagged conversation.item.delete event", () => {
    const event = buildFramePruneEvent("item_a", 7);

    expect(event).toEqual({
      event_id: `${FRAME_PRUNE_EVENT_PREFIX}7`,
      type: "conversation.item.delete",
      item_id: "item_a",
    });
  });
});

describe("isFramePruneError", () => {
  it("matches error events that reference a prune event id", () => {
    const event = {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Item does not exist.",
        event_id: `${FRAME_PRUNE_EVENT_PREFIX}3`,
      },
    };

    expect(isFramePruneError(event)).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(
      isFramePruneError({
        type: "error",
        error: { message: "Rate limit reached.", event_id: "evt_client_9" },
      }),
    ).toBe(false);
    expect(
      isFramePruneError({
        type: "error",
        error: { message: "No event id." },
      }),
    ).toBe(false);
    expect(isFramePruneError({ type: "response.done" })).toBe(false);
  });
});
