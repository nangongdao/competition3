import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { UpstreamCircuitBreaker } from "./upstream-circuit-breaker";

type StoredCircuitState = {
  mode: string;
  consecutive_failures: number;
  open_until: number;
  generation: number;
  probe_in_flight: number;
};

function getCircuitNamespace(): DurableObjectNamespace<UpstreamCircuitBreaker> {
  const namespace = env.UPSTREAM_CIRCUIT_BREAKER;

  if (namespace === undefined) {
    throw new Error("UPSTREAM_CIRCUIT_BREAKER test binding is missing.");
  }

  return namespace;
}

async function readStoredState(
  stub: DurableObjectStub<UpstreamCircuitBreaker>,
): Promise<StoredCircuitState> {
  return runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec<StoredCircuitState>(
        `SELECT mode, consecutive_failures, open_until, generation,
                probe_in_flight
           FROM circuit_state
          WHERE id = 1`,
      )
      .one(),
  );
}

describe("UpstreamCircuitBreaker Workers runtime integration", () => {
  it("persists an open circuit after three retry-exhausted failures", async () => {
    const stub = getCircuitNamespace().getByName("runtime-open-test");

    for (let failure = 0; failure < 3; failure += 1) {
      const permit = await stub.acquire();

      expect(permit.allowed).toBe(true);
      if (!permit.allowed) {
        throw new Error("Expected a closed-circuit permit.");
      }

      await stub.recordFailure(permit.generation);
    }

    const rejectedPermit = await stub.acquire();

    expect(rejectedPermit.allowed).toBe(false);
    if (rejectedPermit.allowed) {
      throw new Error("Expected the circuit to reject after the threshold.");
    }

    expect(rejectedPermit.mode).toBe("open");
    expect(rejectedPermit.retryAfterMs).toBeGreaterThan(0);

    const storedState = await readStoredState(stub);

    expect(storedState.mode).toBe("open");
    expect(storedState.consecutive_failures).toBe(3);
    expect(storedState.open_until).toBeGreaterThan(Date.now());
    expect(storedState.probe_in_flight).toBe(0);
  });

  it("allows one half-open probe and closes after a successful probe", async () => {
    const stub = getCircuitNamespace().getByName("runtime-probe-test");

    await stub.acquire();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE circuit_state
            SET mode = 'open',
                consecutive_failures = 3,
                open_until = 0,
                generation = 4,
                probe_in_flight = 0
          WHERE id = 1`,
      );
    });

    const probePermit = await stub.acquire();

    expect(probePermit.allowed).toBe(true);
    if (!probePermit.allowed) {
      throw new Error("Expected an expired open circuit to allow a probe.");
    }

    expect(probePermit.isProbe).toBe(true);

    const concurrentPermit = await stub.acquire();

    expect(concurrentPermit.allowed).toBe(false);
    if (concurrentPermit.allowed) {
      throw new Error("Expected only one half-open probe.");
    }

    expect(concurrentPermit.mode).toBe("half-open");

    await stub.recordSuccess(probePermit.generation);

    const recoveredPermit = await stub.acquire();

    expect(recoveredPermit).toMatchObject({
      allowed: true,
      isProbe: false,
    });

    const storedState = await readStoredState(stub);

    expect(storedState.mode).toBe("closed");
    expect(storedState.consecutive_failures).toBe(0);
    expect(storedState.open_until).toBe(0);
    expect(storedState.probe_in_flight).toBe(0);
  });
});
