import type { UpstreamCircuitBreaker } from "../../durable-objects/upstream-circuit-breaker";
import type { CircuitPermit } from "../../durable-objects/upstream-circuit-state";
import type { CloudflareBindings } from "../../types";
import { logWorkerEvent } from "../logger";

export type UpstreamOperation = "chat" | "realtime" | "transcription";

export type CircuitLease = {
  permit: CircuitPermit;
  recordSuccess: () => Promise<void>;
  recordFailure: () => Promise<void>;
  recordNeutral: () => Promise<void>;
};

type CircuitStub = DurableObjectStub<UpstreamCircuitBreaker>;

const FAIL_OPEN_PERMIT: CircuitPermit = {
  allowed: true,
  generation: -1,
  isProbe: false,
};

export async function acquireCircuitLease(input: {
  env: CloudflareBindings;
  operation: UpstreamOperation;
  url: string;
  requestId: string;
}): Promise<CircuitLease> {
  const namespace = input.env.UPSTREAM_CIRCUIT_BREAKER;

  if (namespace === undefined) {
    logWorkerEvent("warn", "upstream_circuit_binding_missing", {
      requestId: input.requestId,
      operation: input.operation,
    });
    return createNoopLease();
  }

  const origin = new URL(input.url).origin;
  const stub = namespace.getByName(`${origin}|${input.operation}`);

  try {
    const permit = await stub.acquire();

    if (!permit.allowed) {
      logWorkerEvent("warn", "upstream_circuit_rejected", {
        requestId: input.requestId,
        operation: input.operation,
        providerOrigin: origin,
        circuitMode: permit.mode,
        retryAfterMs: permit.retryAfterMs,
      });
    }

    return createStubLease(stub, permit, input, origin);
  } catch (error: unknown) {
    logWorkerEvent("error", "upstream_circuit_acquire_failed", {
      requestId: input.requestId,
      operation: input.operation,
      providerOrigin: origin,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return createNoopLease();
  }
}

function createNoopLease(): CircuitLease {
  return {
    permit: FAIL_OPEN_PERMIT,
    recordSuccess: (): Promise<void> => Promise.resolve(),
    recordFailure: (): Promise<void> => Promise.resolve(),
    recordNeutral: (): Promise<void> => Promise.resolve(),
  };
}

function createStubLease(
  stub: CircuitStub,
  permit: CircuitPermit,
  input: {
    operation: UpstreamOperation;
    requestId: string;
  },
  origin: string,
): CircuitLease {
  if (!permit.allowed) {
    return {
      permit,
      recordSuccess: (): Promise<void> => Promise.resolve(),
      recordFailure: (): Promise<void> => Promise.resolve(),
      recordNeutral: (): Promise<void> => Promise.resolve(),
    };
  }

  return {
    permit,
    recordSuccess: (): Promise<void> =>
      recordOutcome(
        stub,
        "success",
        permit.generation,
        input,
        origin,
      ),
    recordFailure: (): Promise<void> =>
      recordOutcome(
        stub,
        "failure",
        permit.generation,
        input,
        origin,
      ),
    recordNeutral: (): Promise<void> =>
      recordOutcome(
        stub,
        "neutral",
        permit.generation,
        input,
        origin,
      ),
  };
}

async function recordOutcome(
  stub: CircuitStub,
  outcome: "success" | "failure" | "neutral",
  generation: number,
  input: {
    operation: UpstreamOperation;
    requestId: string;
  },
  origin: string,
): Promise<void> {
  try {
    if (outcome === "success") {
      await stub.recordSuccess(generation);
    } else if (outcome === "failure") {
      await stub.recordFailure(generation);
    } else {
      await stub.recordNeutral(generation);
    }
  } catch (error: unknown) {
    logWorkerEvent("error", "upstream_circuit_record_failed", {
      requestId: input.requestId,
      operation: input.operation,
      providerOrigin: origin,
      outcome,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
