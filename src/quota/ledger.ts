import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AGENT_IDS, isAgentId } from '../types.ts';
import type { AgentId, Limits } from '../types.ts';

/** Counts only: no prompt, output, or secret ever lands here (Req 3.8). */
export interface UsageEvent {
  ts: number;
  agent: AgentId;
  tokens: number;
  ok: boolean;
  estimated: boolean;
  /** set only when the run hit a vendor rate limit (Req 8.1) */
  rateLimited?: boolean;
}

export interface QuotaSnapshot {
  agent: AgentId;
  usedTokens: number;
  usedRequests: number;
  tokenLimit: number | null;
  requestLimit: number | null;
  /** 0..1, smallest remaining fraction across limited dimensions; 1 if unlimited */
  headroom: number;
  exhausted: boolean;
  /** when the oldest counted event leaves the window, or null if none */
  resetsAt: number | null;
  /** end of the rate-limit cooldown, or null if not cooling down (Req 8.2) */
  coolingUntil: number | null;
}

export interface LedgerStore {
  load(): string[];
  append(line: string): void;
}

export function memoryStore(initial: string[] = []): LedgerStore & { lines: string[] } {
  const lines = [...initial];
  return { lines, load: () => [...lines], append: (l) => void lines.push(l) };
}

export function fileStore(path: string): LedgerStore {
  return {
    load: () => (existsSync(path) ? readFileSync(path, 'utf8').split('\n') : []),
    append(line) {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, line + '\n', 'utf8');
    },
  };
}

export function parseEvent(line: string): UsageEvent | undefined {
  if (!line.trim()) return undefined;
  try {
    const v = JSON.parse(line) as Record<string, unknown>;
    if (
      typeof v.ts === 'number' && Number.isFinite(v.ts) && isAgentId(v.agent) &&
      typeof v.tokens === 'number' && Number.isFinite(v.tokens) && v.tokens >= 0
    ) {
      const e: UsageEvent = { ts: v.ts, agent: v.agent, tokens: v.tokens, ok: v.ok !== false, estimated: v.estimated === true };
      if (v.rateLimited === true) e.rateLimited = true;
      return e;
    }
  } catch {
    /* malformed lines are ignored (Req 3.3) */
  }
  return undefined;
}

function remaining(used: number, limit: number | undefined): number {
  if (limit === undefined) return 1;
  if (limit <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - used / limit));
}

export const DEFAULT_COOLDOWN_MS = 15 * 60_000;

export class QuotaLedger {
  private events: UsageEvent[] = [];
  private readonly limits: Partial<Record<AgentId, Limits>>;
  private readonly windowMs: number;
  private readonly store: LedgerStore;
  private readonly cooldownMs: number;

  constructor(limits: Partial<Record<AgentId, Limits>>, windowMs: number, store: LedgerStore, cooldownMs: number = DEFAULT_COOLDOWN_MS) {
    this.limits = limits;
    this.windowMs = windowMs;
    this.store = store;
    this.cooldownMs = cooldownMs;
    for (const line of store.load()) {
      const e = parseEvent(line);
      if (e) this.events.push(e);
    }
    this.events.sort((a, b) => a.ts - b.ts);
  }

  record(event: UsageEvent, now: number = event.ts): void {
    const clean: UsageEvent = {
      ts: event.ts, agent: event.agent, tokens: Math.max(0, Math.round(event.tokens)),
      ok: event.ok, estimated: event.estimated,
    };
    if (event.rateLimited) clean.rateLimited = true;
    this.store.append(JSON.stringify(clean));
    this.events.push(clean);
    this.events.sort((a, b) => a.ts - b.ts);
    const cutoff = now - this.windowMs;
    const coolCutoff = now - this.cooldownMs;
    this.events = this.events.filter((e) => e.ts > cutoff || (e.rateLimited === true && e.ts > coolCutoff));
  }

  snapshot(agent: AgentId, now: number): QuotaSnapshot {
    const cutoff = now - this.windowMs;
    let usedTokens = 0;
    let usedRequests = 0;
    let oldest: number | null = null;
    let coolingUntil: number | null = null;
    for (const e of this.events) {
      if (e.agent !== agent || e.ts > now) continue;
      if (e.rateLimited && now < e.ts + this.cooldownMs) {
        coolingUntil = Math.max(coolingUntil ?? 0, e.ts + this.cooldownMs);
      }
      if (e.ts <= cutoff) continue;
      usedTokens += e.tokens;
      usedRequests += 1;
      if (oldest === null || e.ts < oldest) oldest = e.ts;
    }
    const lim = this.limits[agent] ?? {};
    const exhausted =
      (lim.tokens !== undefined && usedTokens >= lim.tokens) ||
      (lim.requests !== undefined && usedRequests >= lim.requests);
    const headroom = exhausted ? 0 : Math.min(remaining(usedTokens, lim.tokens), remaining(usedRequests, lim.requests));
    return {
      agent, usedTokens, usedRequests,
      tokenLimit: lim.tokens ?? null, requestLimit: lim.requests ?? null,
      headroom, exhausted,
      resetsAt: oldest === null ? null : oldest + this.windowMs,
      coolingUntil,
    };
  }

  snapshotAll(now: number): QuotaSnapshot[] {
    return AGENT_IDS.map((id) => this.snapshot(id, now));
  }
}
