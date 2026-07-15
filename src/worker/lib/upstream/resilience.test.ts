import { describe, expect, it, vi } from "vitest";

import type { CloudflareBindings } from "../../types";
import type { CircuitLease } from "./circuit-client";
import {
  executeUpstreamRequest,
  UpstreamRequestError,
} from "./resilience";

const mockAssets: Fetcher = {
  fetch: (): Promise<Response> => Promise.resolve(new Response(null, { status: 404 })),
  connect: (): Socket => {
    throw new Error("ASSETS.connect is not used in resilience tests.");
  },
};

const env: CloudflareBindings = {
  ASSETS: mockAssets,
  ENVIRONMENT: "test",
};

function createLeaseHarness(): {
  lease: CircuitLease;
  recordSuccess: ReturnType<typeof vi.fn>;
  recordFailure: ReturnType<typeof vi.fn>;
  recordNeutral: ReturnType<typeof vi.fn>;
} {
  const recordSuccess = vi.fn((): Promise<void> => Promise.resolve());
  const recordFailure = vi.fn((): Promise<void> => Promise.resolve());
  const recordNeutral = vi.fn((): Promise<void> => Promise.resolve());

  return {
    lease: {
      permit: { allowed: true, generation: 4, isProbe: false },
      recordSuccess,
      recordFailure,
      recordNeutral,
    },
    recordSuccess,
    recordFailure,
    recordNeutral,
  };
}

function createBaseInput(
  lease: CircuitLease,
  fetcher: typeof fetch,
  requestSignal: AbortSignal = new AbortController().signal,
) {
  return {
    env,
    operation: "chat" as const,
    url: "https://provider.example/v1/chat/completions",
    requestId: "request-test",
    requestSignal,
    policy: {
      timeoutMs: 50,
      maxAttempts: 2,
    },
    buildRequestInit: (idempotencyKey: string): RequestInit => ({
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    }),
    dependencies: {
      acquireLease: (): Promise<CircuitLease> => Promise.resolve(lease),
      fetcher,
      sleep: (): Promise<void> => Promise.resolve(),
      createIdempotencyKey: (): string => "idem-test",
      getJitter: (): number => 0.5,
    },
  };
}

describe("executeUpstreamRequest", () => {
  it("retries one transient response and reuses the idempotency key", async () => {
    const harness = createLeaseHarness();
    const requestInits: RequestInit[] = [];
    let attempt = 0;
    const fetcher: typeof fetch = (_input, init): Promise<Response> => {
      requestInits.push(init ?? {});
      attempt += 1;
      return Promise.resolve(
        attempt === 1
          ? new Response("retry", { status: 503 })
          : Response.json({ ok: true }),
      );
    };

    const response = await executeUpstreamRequest(
      createBaseInput(harness.lease, fetcher),
    );

    expect(response.status).toBe(200);
    expect(requestInits).toHaveLength(2);
    expect(new Headers(requestInits[0]?.headers).get("Idempotency-Key")).toBe(
      "idem-test",
    );
    expect(new Headers(requestInits[1]?.headers).get("Idempotency-Key")).toBe(
      "idem-test",
    );
    expect(harness.recordSuccess).toHaveBeenCalledOnce();
    expect(harness.recordFailure).not.toHaveBeenCalled();
  });

  it("does not retry or count a non-retryable 400 response as failure", async () => {
    const harness = createLeaseHarness();
    const fetcher = vi.fn((): Promise<Response> =>
      Promise.resolve(new Response("bad request", { status: 400 })),
    );

    const response = await executeUpstreamRequest(
      createBaseInput(harness.lease, fetcher),
    );

    expect(response.status).toBe(400);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(harness.recordNeutral).toHaveBeenCalledOnce();
    expect(harness.recordFailure).not.toHaveBeenCalled();
  });

  it("bounds Retry-After and reports a final 429 as rate limited", async () => {
    const harness = createLeaseHarness();
    const sleep = vi.fn((): Promise<void> => Promise.resolve());
    const fetcher = vi.fn((): Promise<Response> =>
      Promise.resolve(
        new Response("limited", {
          status: 429,
          headers: { "Retry-After": "999" },
        }),
      ),
    );
    const input = createBaseInput(harness.lease, fetcher);
    input.dependencies.sleep = sleep;

    await expect(executeUpstreamRequest(input)).rejects.toMatchObject({
      kind: "rate-limited",
      retryAfterSeconds: 2,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000, input.requestSignal);
    expect(harness.recordFailure).toHaveBeenCalledOnce();
  });

  it("times out each provider attempt and records one exhausted failure", async () => {
    const harness = createLeaseHarness();
    const fetcher: typeof fetch = (_input, init): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!(signal instanceof AbortSignal)) {
          reject(new Error("Expected an abort signal."));
          return;
        }

        const rejectForAbort = (): void => {
          reject(signal.reason);
        };

        if (signal.aborted) {
          rejectForAbort();
        } else {
          signal.addEventListener("abort", rejectForAbort, { once: true });
        }
      });
    const input = createBaseInput(harness.lease, fetcher);
    input.policy.timeoutMs = 5;

    await expect(executeUpstreamRequest(input)).rejects.toMatchObject({
      kind: "timeout",
    });
    expect(harness.recordFailure).toHaveBeenCalledOnce();
    expect(harness.recordNeutral).not.toHaveBeenCalled();
  });

  it("aborts an in-flight fetch when the inbound request is cancelled", async () => {
    const harness = createLeaseHarness();
    const requestController = new AbortController();
    let providerSignal: AbortSignal | undefined;
    const fetcher: typeof fetch = (_input, init): Promise<Response> =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;

        if (!(signal instanceof AbortSignal)) {
          reject(new Error("Expected an abort signal."));
          return;
        }

        providerSignal = signal;
        signal.addEventListener("abort", (): void => reject(signal.reason), {
          once: true,
        });
      });
    const request = executeUpstreamRequest(
      createBaseInput(harness.lease, fetcher, requestController.signal),
    );

    await Promise.resolve();
    requestController.abort(new DOMException("Client closed", "AbortError"));

    await expect(request).rejects.toMatchObject({ kind: "cancelled" });
    expect(providerSignal?.aborted).toBe(true);
    expect(harness.recordNeutral).toHaveBeenCalledOnce();
    expect(harness.recordFailure).not.toHaveBeenCalled();
  });

  it("fails before fetching when the circuit is open", async () => {
    const fetcher = vi.fn((): Promise<Response> => Promise.resolve(Response.json({})));
    const lease: CircuitLease = {
      permit: { allowed: false, retryAfterMs: 4_200, mode: "open" },
      recordSuccess: (): Promise<void> => Promise.resolve(),
      recordFailure: (): Promise<void> => Promise.resolve(),
      recordNeutral: (): Promise<void> => Promise.resolve(),
    };

    await expect(
      executeUpstreamRequest(createBaseInput(lease, fetcher)),
    ).rejects.toEqual(
      expect.objectContaining<Partial<UpstreamRequestError>>({
        kind: "circuit-open",
        retryAfterSeconds: 5,
      }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("records one breaker failure after retry exhaustion", async () => {
    const harness = createLeaseHarness();
    const fetcher = vi.fn((): Promise<Response> =>
      Promise.resolve(new Response("unavailable", { status: 503 })),
    );

    await expect(
      executeUpstreamRequest(createBaseInput(harness.lease, fetcher)),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(harness.recordFailure).toHaveBeenCalledOnce();
  });
});
