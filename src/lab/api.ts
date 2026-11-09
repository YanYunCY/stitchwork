import type { AgentInfo, Gateway } from '../gateway.ts';
import type { QuotaSnapshot } from '../quota/ledger.ts';
import type { AgentId } from '../types.ts';
import { recentRuns } from './runs.ts';
import type { RunRow } from './runs.ts';

export interface ApiResponse { status: number; body: unknown }

export interface LabAgent {
  id: AgentId;
  name: string;
  enabled: boolean;
  available: boolean;
  quota: QuotaSnapshot;
}
export interface LabState { now: number; readOnly: boolean; agents: LabAgent[] }
export interface LabSkill { name: string; description: string; agents: AgentId[] }

/** Deliberately drops `binary`: the lab shows state, not local paths. */
const toLabAgent = (a: AgentInfo): LabAgent => ({ id: a.id, name: a.name, enabled: a.enabled, available: a.available, quota: a.quota });

export function state(gw: Gateway, readOnly: boolean, now: number = Date.now()): ApiResponse {
  const body: LabState = { now, readOnly, agents: gw.agents().map(toLabAgent) };
  return { status: 200, body };
}

export function runs(gw: Gateway): ApiResponse {
  let rows: RunRow[] = [];
  try {
    rows = recentRuns(gw.store.load());
  } catch {
    /* an unreadable ledger yields an empty list, not an error */
  }
  return { status: 200, body: { runs: rows } };
}

export function skills(gw: Gateway): ApiResponse {
  const list: LabSkill[] = gw.skills.list().map((s) => ({ name: s.name, description: s.description, agents: s.agents }));
  return { status: 200, body: { skills: list } };
}
