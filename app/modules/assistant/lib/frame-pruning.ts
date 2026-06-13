/**
 * Conversation history pruning for sampled camera frames.
 *
 * Realtime billing re-bills the whole conversation history as input on
 * every `response.create`. A sampled 640px frame is ~500-800 image tokens,
 * so frames left in history snowball: each later turn pays for every frame
 * again. Frames carry one-shot context ("what does the scene look like
 * right now"), so once a response has consumed a frame the item can be
 * deleted from the server-side conversation via `conversation.item.delete`.
 * The assistant's own text replies about the scene stay in history, which
 * preserves conversational continuity.
 *
 * Lifecycle tracked here:
 *
 *   conversation.item.created (input_image part)  -> pending
 *   response.created                              -> pending becomes in-flight
 *   response.done                                 -> in-flight becomes consumed,
 *                                                    emit delete events
 *
 * Frames sampled while a response is in flight stay pending so they are
 * only deleted after the next response actually had them in context.
 */

import { getStringField, isRecord } from "@/modules/assistant/lib/type-guards";

export const FRAME_PRUNE_EVENT_PREFIX = "evt_prune_";

export type RealtimeItemDeleteEvent = {
  event_id: string;
  type: "conversation.item.delete";
  item_id: string;
};

export type FramePruneTracker = {
  /** Frame item ids created but not yet inside any response context. */
  pendingItemIds: readonly string[];
  /** Frame item ids that the in-flight response is using as context. */
  inFlightItemIds: readonly string[];
};

export function createFramePruneTracker(): FramePruneTracker {
  return {
    pendingItemIds: [],
    inFlightItemIds: [],
  };
}

function hasInputImagePart(content: unknown): boolean {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some(
    (part) => isRecord(part) && part.type === "input_image",
  );
}

/**
 * Returns the item id when the event is a `conversation.item.created`
 * confirmation for a user message that contains an image part.
 */
export function getCreatedImageItemId(
  event: Record<string, unknown>,
): string | null {
  if (event.type !== "conversation.item.created") {
    return null;
  }

  const item = event.item;

  if (!isRecord(item)) {
    return null;
  }

  const itemId = getStringField(item, "id");

  if (itemId === null || !hasInputImagePart(item.content)) {
    return null;
  }

  return itemId;
}

export function trackCreatedFrame(
  tracker: FramePruneTracker,
  itemId: string,
): FramePruneTracker {
  if (
    tracker.pendingItemIds.includes(itemId) ||
    tracker.inFlightItemIds.includes(itemId)
  ) {
    return tracker;
  }

  return {
    ...tracker,
    pendingItemIds: [...tracker.pendingItemIds, itemId],
  };
}

/**
 * Marks pending frames as context for the response that just started.
 * Frames already in flight stay in flight (multiple response.created
 * events without response.done are collapsed conservatively).
 */
export function beginResponse(tracker: FramePruneTracker): FramePruneTracker {
  if (tracker.pendingItemIds.length === 0) {
    return tracker;
  }

  return {
    pendingItemIds: [],
    inFlightItemIds: [...tracker.inFlightItemIds, ...tracker.pendingItemIds],
  };
}

/**
 * Completes the in-flight response: returns the consumed frame ids to
 * delete and the tracker without them.
 */
export function completeResponse(tracker: FramePruneTracker): {
  tracker: FramePruneTracker;
  consumedItemIds: readonly string[];
} {
  if (tracker.inFlightItemIds.length === 0) {
    return { tracker, consumedItemIds: [] };
  }

  return {
    tracker: {
      ...tracker,
      inFlightItemIds: [],
    },
    consumedItemIds: tracker.inFlightItemIds,
  };
}

export function buildFramePruneEvent(
  itemId: string,
  sequence: number,
): RealtimeItemDeleteEvent {
  return {
    event_id: `${FRAME_PRUNE_EVENT_PREFIX}${sequence}`,
    type: "conversation.item.delete",
    item_id: itemId,
  };
}

/**
 * Recognizes error events caused by our own prune deletes (for example
 * the item was already removed server-side). These are silenced instead
 * of surfacing as session errors.
 */
export function isFramePruneError(event: Record<string, unknown>): boolean {
  if (event.type !== "error") {
    return false;
  }

  const errorValue = event.error;

  if (!isRecord(errorValue)) {
    return false;
  }

  const relatedEventId = getStringField(errorValue, "event_id");

  return (
    relatedEventId !== null &&
    relatedEventId.startsWith(FRAME_PRUNE_EVENT_PREFIX)
  );
}
