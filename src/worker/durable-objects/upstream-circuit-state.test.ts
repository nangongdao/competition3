import { describe, expect, it } from "vitest";

import {
  acquireCircuitPermit,
  createInitialCircuitState,
  DEFAULT_CIRCUIT_POLICY,
  recordCircuitFailure,
  recordCircuitNeutral,
  recordCircuitSuccess,
  type CircuitState,
} from "./upstream-circuit-state";

const NOW = 1_000;

function openCircuit(now: number = NOW): CircuitState {
  let state = createInitialCircuitState();

  for (let failure = 0; failure < 3; failure += 1) {
    state = recordCircuitFailure(state, state.generation, now);
  }

  return state;
}

describe("upstream circuit state", () => {
  it("keeps the circuit closed until the third consecutive failure", () => {
    let state = createInitialCircuitState();
    const initialPermit = acquireCircuitPermit(state, NOW);

    expect(initialPermit.permit).toEqual({
      allowed: true,
      generation: 0,
      isProbe: false,
    });

    state = recordCircuitFailure(state, 0, NOW);
    expect(state.mode).toBe("closed");
    expect(state.consecutiveFailures).toBe(1);

    state = recordCircuitFailure(state, 0, NOW);
    expect(state.mode).toBe("closed");
    expect(state.consecutiveFailures).toBe(2);

    state = recordCircuitFailure(state, 0, NOW);
    expect(state.mode).toBe("open");
    expect(state.openUntil).toBe(NOW + 20_000);
    expect(state.generation).toBe(1);
  });

  it("rejects requests while open and allows exactly one half-open probe", () => {
    const openedState = openCircuit();
    const rejected = acquireCircuitPermit(openedState, NOW + 5_000);

    expect(rejected.permit).toEqual({
      allowed: false,
      retryAfterMs: 15_000,
      mode: "open",
    });

    const probe = acquireCircuitPermit(openedState, openedState.openUntil);
    expect(probe.permit).toEqual({
      allowed: true,
      generation: 2,
      isProbe: true,
    });
    expect(probe.state.mode).toBe("half-open");

    const concurrent = acquireCircuitPermit(
      probe.state,
      openedState.openUntil + 1,
    );
    expect(concurrent.permit).toEqual({
      allowed: false,
      retryAfterMs: DEFAULT_CIRCUIT_POLICY.probeLeaseMs - 1,
      mode: "half-open",
    });
  });

  it("closes after a successful half-open probe", () => {
    const openedState = openCircuit();
    const probe = acquireCircuitPermit(openedState, openedState.openUntil);

    if (!probe.permit.allowed) {
      throw new Error("Expected a half-open probe permit.");
    }

    const closedState = recordCircuitSuccess(
      probe.state,
      probe.permit.generation,
    );

    expect(closedState).toEqual({
      mode: "closed",
      consecutiveFailures: 0,
      openUntil: 0,
      generation: 3,
      probeInFlight: false,
    });
  });

  it("opens for 60 seconds after a failed half-open probe", () => {
    const openedState = openCircuit();
    const probe = acquireCircuitPermit(openedState, openedState.openUntil);

    if (!probe.permit.allowed) {
      throw new Error("Expected a half-open probe permit.");
    }

    const failureAt = openedState.openUntil + 2_000;
    const nextState = recordCircuitFailure(
      probe.state,
      probe.permit.generation,
      failureAt,
    );

    expect(nextState.mode).toBe("open");
    expect(nextState.openUntil).toBe(failureAt + 60_000);
    expect(nextState.generation).toBe(3);
  });

  it("briefly reopens after a neutral half-open result", () => {
    const openedState = openCircuit();
    const probe = acquireCircuitPermit(openedState, openedState.openUntil);

    if (!probe.permit.allowed) {
      throw new Error("Expected a half-open probe permit.");
    }

    const neutralAt = openedState.openUntil + 3_000;
    const nextState = recordCircuitNeutral(
      probe.state,
      probe.permit.generation,
      neutralAt,
    );

    expect(nextState.mode).toBe("open");
    expect(nextState.openUntil).toBe(neutralAt + 5_000);
    expect(nextState.generation).toBe(3);
  });

  it("ignores stale outcomes from older generations", () => {
    const openedState = openCircuit();

    expect(recordCircuitSuccess(openedState, 0)).toBe(openedState);
    expect(recordCircuitFailure(openedState, 0, NOW + 10_000)).toBe(
      openedState,
    );
    expect(recordCircuitNeutral(openedState, 0, NOW + 10_000)).toBe(
      openedState,
    );
  });

  it("allows a new probe after the previous probe lease expires", () => {
    const openedState = openCircuit();
    const firstProbe = acquireCircuitPermit(openedState, openedState.openUntil);
    const secondProbe = acquireCircuitPermit(
      firstProbe.state,
      firstProbe.state.openUntil,
    );

    expect(secondProbe.permit).toEqual({
      allowed: true,
      generation: 3,
      isProbe: true,
    });
    expect(secondProbe.state.openUntil).toBe(
      firstProbe.state.openUntil + DEFAULT_CIRCUIT_POLICY.probeLeaseMs,
    );
  });
});
