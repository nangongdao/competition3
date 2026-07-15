import { DurableObject } from "cloudflare:workers";

import type { CloudflareBindings } from "../types";
import {
  acquireCircuitPermit,
  createInitialCircuitState,
  recordCircuitFailure,
  recordCircuitNeutral,
  recordCircuitSuccess,
  type CircuitPermit,
  type CircuitState,
} from "./upstream-circuit-state";

type StoredCircuitState = {
  mode: string;
  consecutive_failures: number;
  open_until: number;
  generation: number;
  probe_in_flight: number;
};

export class UpstreamCircuitBreaker extends DurableObject<CloudflareBindings> {
  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);
    void this.ctx.blockConcurrencyWhile(async (): Promise<void> => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS circuit_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          mode TEXT NOT NULL,
          consecutive_failures INTEGER NOT NULL,
          open_until INTEGER NOT NULL,
          generation INTEGER NOT NULL,
          probe_in_flight INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO circuit_state (
          id,
          mode,
          consecutive_failures,
          open_until,
          generation,
          probe_in_flight
        ) VALUES (1, 'closed', 0, 0, 0, 0);
      `);
    });
  }

  acquire(): CircuitPermit {
    const currentState = this.readState();
    const result = acquireCircuitPermit(currentState, Date.now());

    if (result.state !== currentState) {
      this.writeState(result.state);
    }

    return result.permit;
  }

  recordSuccess(generation: number): void {
    const currentState = this.readState();
    const nextState = recordCircuitSuccess(currentState, generation);

    if (nextState !== currentState) {
      this.writeState(nextState);
    }
  }

  recordFailure(generation: number): void {
    const currentState = this.readState();
    const nextState = recordCircuitFailure(
      currentState,
      generation,
      Date.now(),
    );

    if (nextState !== currentState) {
      this.writeState(nextState);
    }
  }

  recordNeutral(generation: number): void {
    const currentState = this.readState();
    const nextState = recordCircuitNeutral(
      currentState,
      generation,
      Date.now(),
    );

    if (nextState !== currentState) {
      this.writeState(nextState);
    }
  }

  private readState(): CircuitState {
    const row = this.ctx.storage.sql
      .exec<StoredCircuitState>(
        `SELECT mode, consecutive_failures, open_until, generation,
                probe_in_flight
           FROM circuit_state
          WHERE id = 1`,
      )
      .one();
    const initialState = createInitialCircuitState();
    const mode =
      row.mode === "open" || row.mode === "half-open" || row.mode === "closed"
        ? row.mode
        : initialState.mode;

    return {
      mode,
      consecutiveFailures: Math.max(0, row.consecutive_failures),
      openUntil: Math.max(0, row.open_until),
      generation: Math.max(0, row.generation),
      probeInFlight: row.probe_in_flight === 1,
    };
  }

  private writeState(state: CircuitState): void {
    this.ctx.storage.sql.exec(
      `UPDATE circuit_state
          SET mode = ?,
              consecutive_failures = ?,
              open_until = ?,
              generation = ?,
              probe_in_flight = ?
        WHERE id = 1`,
      state.mode,
      state.consecutiveFailures,
      state.openUntil,
      state.generation,
      state.probeInFlight ? 1 : 0,
    );
  }
}
