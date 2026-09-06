export type CircuitMode = "closed" | "open" | "half-open";

export type CircuitState = {
  mode: CircuitMode;
  consecutiveFailures: number;
  openUntil: number;
  generation: number;
  probeInFlight: boolean;
};

export type CircuitPermit =
  | {
      allowed: true;
      generation: number;
      isProbe: boolean;
    }
  | {
      allowed: false;
      retryAfterMs: number;
      mode: "open" | "half-open";
    };

export type CircuitPolicy = {
  failureThreshold: number;
  openCooldownMs: number;
  failedProbeCooldownMs: number;
  probeLeaseMs: number;
  neutralProbeCooldownMs: number;
};

/**
 * 熔断器只读健康快照（用于 `GET /api/circuit` 等监控端点）。
 *
 * 与 `CircuitState` 对齐，另派生 `isOpen`（当前是否拒绝请求）与
 * `retryAfterMs`（若拒绝，还需等待多久），供监控/告警直接消费。
 */
export type CircuitSnapshot = {
  mode: CircuitMode;
  consecutiveFailures: number;
  openUntil: number;
  generation: number;
  probeInFlight: boolean;
  isOpen: boolean;
  retryAfterMs: number;
};

/**
 * 由 `CircuitState` 派生只读快照。不修改任何状态，纯函数。
 */
export function createCircuitSnapshot(
  state: CircuitState,
  now: number,
): CircuitSnapshot {
  const refusing =
    (state.mode === "open" || state.mode === "half-open") &&
    now < state.openUntil;

  return {
    mode: state.mode,
    consecutiveFailures: state.consecutiveFailures,
    openUntil: state.openUntil,
    generation: state.generation,
    probeInFlight: state.probeInFlight,
    isOpen: refusing,
    retryAfterMs: refusing ? Math.max(1, state.openUntil - now) : 0,
  };
}

export const DEFAULT_CIRCUIT_POLICY: CircuitPolicy = {
  failureThreshold: 3,
  openCooldownMs: 20_000,
  failedProbeCooldownMs: 60_000,
  probeLeaseMs: 45_000,
  neutralProbeCooldownMs: 5_000,
};

export function createInitialCircuitState(): CircuitState {
  return {
    mode: "closed",
    consecutiveFailures: 0,
    openUntil: 0,
    generation: 0,
    probeInFlight: false,
  };
}

export function acquireCircuitPermit(
  state: CircuitState,
  now: number,
  policy: CircuitPolicy = DEFAULT_CIRCUIT_POLICY,
): { state: CircuitState; permit: CircuitPermit } {
  if (state.mode === "closed") {
    return {
      state,
      permit: {
        allowed: true,
        generation: state.generation,
        isProbe: false,
      },
    };
  }

  if (state.mode === "open" && now < state.openUntil) {
    return {
      state,
      permit: {
        allowed: false,
        retryAfterMs: Math.max(1, state.openUntil - now),
        mode: "open",
      },
    };
  }

  if (state.mode === "half-open" && now < state.openUntil) {
    return {
      state,
      permit: {
        allowed: false,
        retryAfterMs: Math.max(1, state.openUntil - now),
        mode: "half-open",
      },
    };
  }

  const nextState: CircuitState = {
    ...state,
    mode: "half-open",
    openUntil: now + policy.probeLeaseMs,
    generation: state.generation + 1,
    probeInFlight: true,
  };

  return {
    state: nextState,
    permit: {
      allowed: true,
      generation: nextState.generation,
      isProbe: true,
    },
  };
}

export function recordCircuitSuccess(
  state: CircuitState,
  generation: number,
): CircuitState {
  if (generation !== state.generation) {
    return state;
  }

  if (state.mode === "half-open") {
    return {
      mode: "closed",
      consecutiveFailures: 0,
      openUntil: 0,
      generation: state.generation + 1,
      probeInFlight: false,
    };
  }

  if (state.mode === "closed" && state.consecutiveFailures > 0) {
    return {
      ...state,
      consecutiveFailures: 0,
    };
  }

  return state;
}

export function recordCircuitFailure(
  state: CircuitState,
  generation: number,
  now: number,
  policy: CircuitPolicy = DEFAULT_CIRCUIT_POLICY,
): CircuitState {
  if (generation !== state.generation) {
    return state;
  }

  if (state.mode === "half-open") {
    return {
      ...state,
      mode: "open",
      consecutiveFailures: policy.failureThreshold,
      openUntil: now + policy.failedProbeCooldownMs,
      generation: state.generation + 1,
      probeInFlight: false,
    };
  }

  if (state.mode !== "closed") {
    return state;
  }

  const consecutiveFailures = state.consecutiveFailures + 1;

  if (consecutiveFailures < policy.failureThreshold) {
    return {
      ...state,
      consecutiveFailures,
    };
  }

  return {
    ...state,
    mode: "open",
    consecutiveFailures,
    openUntil: now + policy.openCooldownMs,
    generation: state.generation + 1,
    probeInFlight: false,
  };
}

export function recordCircuitNeutral(
  state: CircuitState,
  generation: number,
  now: number,
  policy: CircuitPolicy = DEFAULT_CIRCUIT_POLICY,
): CircuitState {
  if (generation !== state.generation || state.mode !== "half-open") {
    return state;
  }

  return {
    ...state,
    mode: "open",
    openUntil: now + policy.neutralProbeCooldownMs,
    generation: state.generation + 1,
    probeInFlight: false,
  };
}
