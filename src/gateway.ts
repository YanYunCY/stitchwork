import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { ADAPTERS, getAdapter } from './adapters/index.ts';
import type { StitchworkConfig } from './config.ts';
import { QuotaLedger, fileStore } from './quota/ledger.ts';
import type { LedgerStore, QuotaSnapshot } from './quota/ledger.ts';
import { isRateLimited } from './ratelimit.ts';
import { chooseAgent } from './router.ts';
import { runProcess } from './runner.ts';
import type { SpawnFn } from './runner.ts';
import { SkillRegistry, renderSkill } from './skills/registry.ts';
import { AGENT_IDS } from './types.ts';
import type { AgentId, RunResult } from './types.ts';

export interface GatewayDeps {
  spawn?: SpawnFn;
  now?: () => number;
  store?: LedgerStore;
  skills?: SkillRegistry;
  /** binary → available? Defaults to a PATH lookup */
  which?: (binary: string) => boolean;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
}

export interface RunRequest {
  agent?: AgentId | 'auto';
  prompt?: string;
  skill?: string;
  input?: string;
  cwd?: string;
}

export interface Fallback {
  agent: AgentId;
  reason: string;
}

export type ProgressEvent =
  | { kind: 'routed'; agent: AgentId; message: string }
  | { kind: 'output'; agent: AgentId; message: string }
  | { kind: 'fallback'; agent: AgentId; message: string }
  | { kind: 'done'; agent: AgentId; message: string };

export interface RunOptions {
  /** abort to cancel the run (Req 10) */
  signal?: AbortSignal;
  onProgress?: (event: ProgressEvent) => void;
}

export type GatewayRunResult =
  | (RunResult & { routedBy: 'explicit' | 'auto'; refused?: false; fallbacks: Fallback[]; rateLimited?: boolean; cancelled?: boolean })
  | { ok: false; refused: true; reason: string; fallbacks?: Fallback[] };

export interface AgentInfo {
  id: AgentId;
  name: string;
  binary: string;
  enabled: boolean;
  available: boolean;
  quota: QuotaSnapshot;
}

export function whichOnPath(binary: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const exts = process.platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  const candidates = isAbsolute(binary) ? [binary] : (env.PATH ?? '').split(delimiter).filter(Boolean).map((d) => join(d, binary));
  for (const c of candidates) {
    for (const ext of exts) {
      try {
        accessSync(c + ext, constants.X_OK);
        return true;
      } catch {
        /* keep looking */
      }
    }
  }
  return false;
}

const tail = (s: string, n = 2048) => (s.length > n ? '…' + s.slice(-n) : s);

export class Gateway {
  readonly config: StitchworkConfig;
  readonly ledger: QuotaLedger;
  readonly skills: SkillRegistry;
  private readonly deps: Required<Omit<GatewayDeps, 'store' | 'skills' | 'spawn'>>;
  private readonly spawn: SpawnFn | undefined;
  private readonly availability = new Map<string, boolean>();

  constructor(config: StitchworkConfig, deps: GatewayDeps = {}) {
    this.config = config;
    const env = deps.env ?? process.env;
    this.spawn = deps.spawn;
    this.deps = {
      now: deps.now ?? Date.now,
      which: deps.which ?? ((b) => whichOnPath(b, env)),
      env,
      log: deps.log ?? ((m) => process.stderr.write(`[stitchwork] ${m}\n`)),
    };
    const limits = Object.fromEntries(AGENT_IDS.map((id) => [id, config.agents[id].limits]));
    this.ledger = new QuotaLedger(limits, config.windowMinutes * 60_000, deps.store ?? fileStore(config.ledgerPath), config.cooldownMinutes * 60_000);
    this.skills = deps.skills ?? SkillRegistry.fromDirectory(config.skillsDir);
    for (const w of this.skills.warnings) this.deps.log(w);
  }

  binaryFor(agent: AgentId): string {
    return this.config.agents[agent].binary ?? ADAPTERS[agent].defaultBinary;
  }

  isAvailable(agent: AgentId): boolean {
    const bin = this.binaryFor(agent);
    let v = this.availability.get(bin);
    if (v === undefined) {
      v = this.deps.which(bin);
      this.availability.set(bin, v);
    }
    return v;
  }

  agents(): AgentInfo[] {
    const now = this.deps.now();
    return AGENT_IDS.map((id) => ({
      id, name: ADAPTERS[id].displayName, binary: this.binaryFor(id),
      enabled: this.config.agents[id].enabled, available: this.isAvailable(id),
      quota: this.ledger.snapshot(id, now),
    }));
  }

  quota(): QuotaSnapshot[] {
    return this.ledger.snapshotAll(this.deps.now());
  }

  async run(req: RunRequest, opts: RunOptions = {}): Promise<GatewayRunResult> {
    let prompt = req.prompt ?? '';
    let preferred: AgentId[] | undefined;
    let timeoutSeconds = this.config.timeoutSeconds;
    if (req.skill) {
      const skill = this.skills.get(req.skill);
      if (!skill) return { ok: false, refused: true, reason: `Unknown skill "${req.skill}".` };
      prompt = renderSkill(skill, req.input ?? req.prompt ?? '');
      preferred = skill.agents;
      if (skill.timeoutSeconds) timeoutSeconds = skill.timeoutSeconds;
    }
    if (!prompt.trim()) return { ok: false, refused: true, reason: 'Prompt is empty.' };

    const emit = (e: ProgressEvent) => {
      try {
        opts.onProgress?.(e);
      } catch {
        /* progress sinks never break a run */
      }
    };
    const tried = new Set<AgentId>();
    const fallbacks: Fallback[] = [];
    let last: GatewayRunResult | undefined;

    for (let attempt = 0; attempt <= this.config.maxFallbacks; attempt++) {
      const now = this.deps.now();
      const decision = chooseAgent(
        { requested: req.agent ?? 'auto', preferred, exclude: tried },
        { isEnabled: (a) => this.config.agents[a].enabled, isAvailable: (a) => this.isAvailable(a), snapshot: (a) => this.ledger.snapshot(a, now) },
        now,
      );
      if (!decision.ok) {
        // After a fallback, report the last real failure rather than a bare refusal (Req 8.4).
        if (last && !last.refused) return { ...last, output: `${last.output}\n\nNo agent left to fall back to: ${decision.reason}`, fallbacks };
        return { ok: false, refused: true, reason: decision.reason, ...(fallbacks.length ? { fallbacks } : {}) };
      }
      const agent = decision.agent;
      tried.add(agent);
      emit({ kind: 'routed', agent, message: `${decision.routedBy === 'auto' ? 'Auto-routed' : 'Running'} on ${ADAPTERS[agent].displayName}` });

      const result = await this.attempt(agent, prompt, timeoutSeconds, req.cwd, opts, emit);
      last = { ...result, routedBy: decision.routedBy, fallbacks };

      if (result.cancelled) return last;
      if (result.rateLimited && decision.routedBy === 'auto' && attempt < this.config.maxFallbacks) {
        const reason = 'rate-limited';
        fallbacks.push({ agent, reason });
        emit({ kind: 'fallback', agent, message: `${ADAPTERS[agent].displayName} is rate-limited; trying another agent` });
        continue;
      }
      emit({ kind: 'done', agent, message: `${result.ok ? 'Finished' : 'Failed'} on ${ADAPTERS[agent].displayName} · ${result.usage.totalTokens} tokens` });
      return last;
    }
    return last as GatewayRunResult;
  }

  private async attempt(
    agent: AgentId, prompt: string, timeoutSeconds: number, cwd: string | undefined,
    opts: RunOptions, emit: (e: ProgressEvent) => void,
  ): Promise<RunResult & { rateLimited?: boolean; cancelled?: boolean }> {
    const adapter = getAdapter(agent);
    const binary = this.binaryFor(agent);
    const proc = await runProcess(
      {
        binary, args: adapter.buildArgs(prompt, this.config.agents[agent].extraArgs), cwd,
        timeoutMs: timeoutSeconds * 1000, env: this.deps.env, signal: opts.signal,
        onStdout: opts.onProgress ? (chunk) => emit({ kind: 'output', agent, message: chunk }) : undefined,
      },
      this.spawn,
      this.deps.now,
    );

    if (proc.notFound) {
      this.availability.set(binary, false);
      return { agent, ok: false, output: `Binary \`${binary}\` not found on PATH. Install ${adapter.displayName} or set agents.${agent}.binary.`, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: true }, durationMs: proc.durationMs, exitCode: null };
    }
    const parsed = adapter.parse(proc.stdout, proc.stderr, prompt);
    let result: RunResult & { rateLimited?: boolean; cancelled?: boolean };
    if (proc.cancelled) {
      result = { agent, ok: false, output: 'Cancelled.', usage: parsed.usage, durationMs: proc.durationMs, exitCode: proc.exitCode, cancelled: true };
    } else if (proc.timedOut) {
      result = { agent, ok: false, output: `${adapter.displayName} timed out after ${timeoutSeconds}s.`, usage: parsed.usage, durationMs: proc.durationMs, exitCode: proc.exitCode };
    } else if (proc.exitCode !== 0) {
      result = { agent, ok: false, output: tail(proc.stderr.trim() || parsed.output || `exit code ${proc.exitCode}`), usage: parsed.usage, durationMs: proc.durationMs, exitCode: proc.exitCode };
      if (isRateLimited(proc.stderr, proc.stdout)) result.rateLimited = true;
    } else {
      result = { agent, ok: true, output: parsed.output, usage: parsed.usage, durationMs: proc.durationMs, exitCode: 0 };
    }
    const finished = this.deps.now();
    this.ledger.record({
      ts: finished, agent, tokens: result.usage.totalTokens, ok: result.ok, estimated: result.usage.estimated,
      ...(result.rateLimited ? { rateLimited: true } : {}),
    }, finished);
    return result;
  }
}
