import { AGENT_IDS } from './types.ts';
import type { AgentId } from './types.ts';
import type { QuotaSnapshot } from './quota/ledger.ts';

export interface RouteContext {
  isEnabled(agent: AgentId): boolean;
  isAvailable(agent: AgentId): boolean;
  snapshot(agent: AgentId): QuotaSnapshot;
}

export interface RouteRequest {
  requested: AgentId | 'auto';
  /** skill-preferred agents, in priority order (Req 4.2) */
  preferred?: readonly AgentId[];
  /** agents already tried for this request (Req 8.3) */
  exclude?: ReadonlySet<AgentId>;
}

export type RouteDecision =
  | { ok: true; agent: AgentId; routedBy: 'explicit' | 'auto' }
  | { ok: false; reason: string };

export function formatReset(resetsAt: number | null, now: number): string {
  if (resetsAt === null) return '';
  const mins = Math.max(0, Math.ceil((resetsAt - now) / 60_000));
  return ` Quota frees up in ~${mins} min (${new Date(resetsAt).toISOString()}).`;
}

export function chooseAgent(req: RouteRequest, ctx: RouteContext, now: number = Date.now()): RouteDecision {
  if (req.requested !== 'auto') {
    const agent = req.requested;
    if (!ctx.isEnabled(agent)) return { ok: false, reason: `Agent "${agent}" is disabled in config.` };
    const snap = ctx.snapshot(agent);
    if (snap.exhausted) {
      return { ok: false, reason: `Agent "${agent}" has no quota left in this window.${formatReset(snap.resetsAt, now)}` };
    }
    if (snap.coolingUntil !== null) {
      return { ok: false, reason: `Agent "${agent}" was rate-limited and is cooling down until ${new Date(snap.coolingUntil).toISOString()}. Use agent "auto" to route elsewhere.` };
    }
    return { ok: true, agent, routedBy: 'explicit' };
  }

  const candidates = req.preferred && req.preferred.length > 0 ? req.preferred : AGENT_IDS;
  const skipped: string[] = [];
  const eligible: { agent: AgentId; headroom: number; order: number }[] = [];
  candidates.forEach((agent, order) => {
    if (req.exclude?.has(agent)) return void skipped.push(`${agent}: already tried`);
    if (!ctx.isEnabled(agent)) return void skipped.push(`${agent}: disabled`);
    if (!ctx.isAvailable(agent)) return void skipped.push(`${agent}: binary not found`);
    const snap = ctx.snapshot(agent);
    if (snap.exhausted) return void skipped.push(`${agent}: quota exhausted${formatReset(snap.resetsAt, now)}`);
    if (snap.coolingUntil !== null) return void skipped.push(`${agent}: rate-limited, cooling down until ${new Date(snap.coolingUntil).toISOString()}`);
    eligible.push({ agent, headroom: snap.headroom, order });
  });
  eligible.sort((a, b) => b.headroom - a.headroom || a.order - b.order);
  const best = eligible[0];
  if (!best) return { ok: false, reason: `No agent is eligible. ${skipped.join('; ')}` };
  return { ok: true, agent: best.agent, routedBy: 'auto' };
}
