import type { Fallback, Gateway } from '../gateway.ts';
import { isAgentId } from '../types.ts';
import type { AgentId } from '../types.ts';
import { err, readBody } from './http.ts';
import type { Ctx, Reply, RouteTable } from './http.ts';

export interface LaunchBody { skill: string; input: string; agent: AgentId | 'auto' }

export type LaunchParse = { ok: true; body: LaunchBody } | { ok: false; reason: string };

/** Validate a launch body without touching the gateway (Req 18.7). */
export function parseLaunchBody(raw: string | undefined, gw: Pick<Gateway, 'skills'>): LaunchParse {
  if (raw === undefined) return { ok: false, reason: 'Body is larger than 64 KiB.' };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'Body is not JSON.' };
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { ok: false, reason: 'Body must be a JSON object.' };
  const o = v as Record<string, unknown>;
  if (typeof o.skill !== 'string' || !gw.skills.get(o.skill)) return { ok: false, reason: 'Unknown skill.' };
  if (o.input !== undefined && typeof o.input !== 'string') return { ok: false, reason: '"input" must be a string.' };
  const agent = o.agent ?? 'auto';
  if (agent !== 'auto' && !isAgentId(agent)) return { ok: false, reason: '"agent" must be an agent id or "auto".' };
  return { ok: true, body: { skill: o.skill, input: o.input ?? '', agent } };
}

export interface LaunchOutcome {
  ok: boolean;
  refused?: boolean;
  reason?: string;
  cancelled?: boolean;
  agent?: AgentId;
  output?: string;
  tokens?: number;
  estimated?: boolean;
  durationMs?: number;
  fallbacks: Fallback[];
}

/**
 * The only write path of the lab: at most one launch at a time (Req 18.4),
 * abortable by Cancel or a closed socket (Req 18.6), refused when read-only (Req 19.3).
 */
interface Slot { controller: AbortController; agent?: AgentId }

export function createLauncher(gw: Gateway, readOnly: boolean, log: (msg: string) => void = () => {}): { routes: RouteTable; shutdown: () => void } {
  const held: { current: Slot | null } = { current: null };

  const launch = async ({ req, res }: Ctx): Promise<Reply> => {
    if (readOnly) {
      req.resume();
      return err(403, 'The lab is read-only.');
    }
    const parsed = parseLaunchBody(await readBody(req), gw);
    if (!parsed.ok) return err(400, parsed.reason);
    // Claim the slot synchronously after validation: no await between check and set.
    if (held.current) return err(409, 'A launch is already running.');
    const slot: Slot = { controller: new AbortController() };
    held.current = slot;
    const onClose = () => { if (!res.writableEnded) slot.controller.abort(); };
    res.on('close', onClose);
    try {
      const { skill, input, agent } = parsed.body;
      const r = await gw.run({ skill, input, agent }, {
        signal: slot.controller.signal,
        onProgress: (e) => { if (e.kind === 'routed') slot.agent = e.agent; },
      });
      const out: LaunchOutcome = r.refused
        ? { ok: false, refused: true, reason: r.reason, fallbacks: r.fallbacks ?? [] }
        : {
            ok: r.ok, agent: r.agent, output: r.output, tokens: r.usage.totalTokens, estimated: r.usage.estimated,
            durationMs: r.durationMs, fallbacks: r.fallbacks, ...(r.cancelled ? { cancelled: true } : {}),
          };
      return { status: 200, body: out };
    } catch (e) {
      log(`launch failed: ${(e as Error).stack ?? String(e)}`);
      return err(500, (e as Error).message || 'Launch failed');
    } finally {
      res.off('close', onClose);
      held.current = null;
    }
  };

  const routes: RouteTable = {
    'POST /api/launch': launch,
    'GET /api/launch/status': () => ({ status: 200, body: { running: held.current !== null, ...(held.current?.agent ? { agent: held.current.agent } : {}) } }),
    'POST /api/launch/cancel': ({ req }) => {
      req.resume();
      const running = held.current !== null;
      held.current?.controller.abort();
      return { status: 200, body: { cancelled: running } };
    },
  };
  return { routes, shutdown: () => held.current?.controller.abort() };
}
