import type { CloudflareBindings } from "../../types";
import { logWorkerEvent } from "../logger";
import {
  acquireCircuitLease,
  type CircuitLease,
  type UpstreamOperation,
} from "./circuit-client";

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRY_DELAY_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 250;

export type UpstreamFailureKind =
  | "cancelled"
  | "circuit-open"
  | "rate-limited"
  | "timeout"
  | "unavailable";

export class UpstreamRequestError extends Error {
  readonly kind: UpstreamFailureKind;
  readonly retryAfterSeconds?: number;

  constructor(
    kind: UpstreamFailureKind,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "UpstreamRequestError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type UpstreamRequestPolicy = {
  timeoutMs: number;
  maxAttempts: number;
};

export type UpstreamRequestDependencies = {
  acquireLease?: (input: {
    env: CloudflareBindings;
    operation: UpstreamOperation;
    url: string;
    requestId: string;
  }) => Promise<CircuitLease>;
  fetcher?: typeof fetch;
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  createIdempotencyKey?: () => string;
  getJitter?: () => number;
};

export async function executeUpstreamRequest(input: {
  env: CloudflareBindings;
  operation: UpstreamOperation;
  url: string;
  requestId: string;
  requestSignal: AbortSignal;
  policy: UpstreamRequestPolicy;
  buildRequestInit: (idempotencyKey: string) => RequestInit;
  dependencies?: UpstreamRequestDependencies;
}): Promise<Response> {
  const dependencies = input.dependencies ?? {};
  const acquireLease = dependencies.acquireLease ?? acquireCircuitLease;
  const lease = await acquireLease({
    env: input.env,
    operation: input.operation,
    url: input.url,
    requestId: input.requestId,
  });

  if (!lease.permit.allowed) {
    throw new UpstreamRequestError(
      "circuit-open",
      "The upstream service is temporarily unavailable.",
      millisecondsToRetryAfterSeconds(lease.permit.retryAfterMs),
    );
  }

  const fetcher = dependencies.fetcher ?? fetch;
  const sleep = dependencies.sleep ?? sleepWithSignal;
  const createIdempotencyKey =
    dependencies.createIdempotencyKey ?? (() => crypto.randomUUID());
  const getJitter = dependencies.getJitter ?? secureRandomUnit;
  const idempotencyKey = createIdempotencyKey();
  const providerOrigin = new URL(input.url).origin;

  for (let attempt = 1; attempt <= input.policy.maxAttempts; attempt += 1) {
    const startedAt = Date.now();

    try {
      logWorkerEvent("info", "upstream_request_attempt", {
        requestId: input.requestId,
        operation: input.operation,
        providerOrigin,
        attempt,
      });
      const response = await fetchAttempt({
        fetcher,
        url: input.url,
        init: input.buildRequestInit(idempotencyKey),
        requestSignal: input.requestSignal,
        timeoutMs: input.policy.timeoutMs,
      });

      if (!RETRYABLE_STATUS_CODES.has(response.status)) {
        if (response.ok) {
          await lease.recordSuccess();
        } else {
          await lease.recordNeutral();
        }
        logWorkerEvent("info", "upstream_request_complete", {
          requestId: input.requestId,
          operation: input.operation,
          providerOrigin,
          attempt,
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      await response.body?.cancel();

      if (attempt < input.policy.maxAttempts) {
        const delayMs = resolveRetryDelayMs(retryAfterMs, attempt, getJitter);
        logWorkerEvent("warn", "upstream_request_retry", {
          requestId: input.requestId,
          operation: input.operation,
          providerOrigin,
          attempt,
          status: response.status,
          delayMs,
        });
        await sleep(delayMs, input.requestSignal);
        continue;
      }

      await lease.recordFailure();
      const retryAfterSeconds = millisecondsToRetryAfterSeconds(
        retryAfterMs ?? DEFAULT_RETRY_DELAY_MS,
      );
      logWorkerEvent("error", "upstream_request_failed", {
        requestId: input.requestId,
        operation: input.operation,
        providerOrigin,
        attempt,
        status: response.status,
        failureKind: response.status === 429 ? "rate-limited" : "unavailable",
        durationMs: Date.now() - startedAt,
      });

      if (response.status === 429) {
        throw new UpstreamRequestError(
          "rate-limited",
          "The upstream service is temporarily rate limited.",
          retryAfterSeconds,
        );
      }

      throw new UpstreamRequestError(
        "unavailable",
        "The upstream service is temporarily unavailable.",
        retryAfterSeconds,
      );
    } catch (error: unknown) {
      const classifiedError = classifyAttemptError(
        error,
        input.requestSignal,
      );

      if (classifiedError.kind === "cancelled") {
        await lease.recordNeutral();
        throw classifiedError;
      }

      if (
        error instanceof UpstreamRequestError &&
        error.retryAfterSeconds !== undefined
      ) {
        throw error;
      }

      if (attempt < input.policy.maxAttempts) {
        const delayMs = resolveRetryDelayMs(undefined, attempt, getJitter);
        logWorkerEvent("warn", "upstream_request_retry", {
          requestId: input.requestId,
          operation: input.operation,
          providerOrigin,
          attempt,
          failureKind: classifiedError.kind,
          delayMs,
        });
        await sleep(delayMs, input.requestSignal);
        continue;
      }

      await lease.recordFailure();
      logWorkerEvent("error", "upstream_request_failed", {
        requestId: input.requestId,
        operation: input.operation,
        providerOrigin,
        attempt,
        failureKind: classifiedError.kind,
        durationMs: Date.now() - startedAt,
      });
      throw classifiedError;
    }
  }

  await lease.recordFailure();
  throw new UpstreamRequestError(
    "unavailable",
    "The upstream service is temporarily unavailable.",
  );
}

async function fetchAttempt(input: {
  fetcher: typeof fetch;
  url: string;
  init: RequestInit;
  requestSignal: AbortSignal;
  timeoutMs: number;
}): Promise<Response> {
  const controller = new AbortController();
  let didTimeout = false;
  const abortFromRequest = (): void => {
    controller.abort(input.requestSignal.reason);
  };

  if (input.requestSignal.aborted) {
    abortFromRequest();
  } else {
    input.requestSignal.addEventListener("abort", abortFromRequest, {
      once: true,
    });
  }

  const timeoutId = setTimeout((): void => {
    didTimeout = true;
    controller.abort(new DOMException("Upstream request timed out.", "TimeoutError"));
  }, input.timeoutMs);

  try {
    return await input.fetcher(input.url, {
      ...input.init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (input.requestSignal.aborted) {
      throw new UpstreamRequestError(
        "cancelled",
        "The client cancelled the request.",
      );
    }

    if (didTimeout) {
      throw new UpstreamRequestError(
        "timeout",
        "The upstream service did not respond in time.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    input.requestSignal.removeEventListener("abort", abortFromRequest);
  }
}

function classifyAttemptError(
  error: unknown,
  requestSignal: AbortSignal,
): UpstreamRequestError {
  if (error instanceof UpstreamRequestError) {
    return error;
  }

  if (requestSignal.aborted) {
    return new UpstreamRequestError(
      "cancelled",
      "The client cancelled the request.",
    );
  }

  return new UpstreamRequestError(
    "unavailable",
    "The upstream service could not be reached.",
  );
}

function resolveRetryDelayMs(
  retryAfterMs: number | undefined,
  attempt: number,
  getJitter: () => number,
): number {
  if (retryAfterMs !== undefined) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, retryAfterMs));
  }

  const baseDelayMs = DEFAULT_RETRY_DELAY_MS * attempt;
  const jitterMultiplier = 0.75 + Math.min(1, Math.max(0, getJitter())) * 0.5;
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(baseDelayMs * jitterMultiplier));
}

function parseRetryAfterMs(value: string | null): number | undefined {
  const normalizedValue = value?.trim();

  if (normalizedValue === undefined || normalizedValue.length === 0) {
    return undefined;
  }

  const seconds = Number(normalizedValue);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, seconds * 1_000);
  }

  const dateMs = Date.parse(normalizedValue);

  if (!Number.isFinite(dateMs)) {
    return undefined;
  }

  return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, dateMs - Date.now()));
}

async function sleepWithSignal(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    throw new UpstreamRequestError(
      "cancelled",
      "The client cancelled the request.",
    );
  }

  await new Promise<void>((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timeoutId);
      reject(
        new UpstreamRequestError(
          "cancelled",
          "The client cancelled the request.",
        ),
      );
    };
    const timeoutId = setTimeout((): void => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delayMs);

    signal.addEventListener("abort", abort, { once: true });
  });
}

function secureRandomUnit(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] ?? 0) / 0xffffffff;
}

function millisecondsToRetryAfterSeconds(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1_000));
}
