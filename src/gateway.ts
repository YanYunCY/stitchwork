import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import { ADAPTERS, getAdapter } from './adapters/index.ts';
import type { StitchworkConfig } from './config.ts';
import { QuotaLedger, fileStore } from './quota/ledger.ts';
import type { LedgerStore, QuotaSnapshot } from './quota/ledger.ts';
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

export type GatewayRunResult =
  | (RunResult & { routedBy: 'explicit' | 'auto'; refused?: false })
  | { ok: false; refused: true; reason: string };

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
    this.ledger = new QuotaLedger(limits, config.windowMinutes * 60_000, deps.store ?? fileStore(config.ledgerPath));
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

  async run(req: RunRequest): Promise<GatewayRunResult> {
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

    const now = this.deps.now();
    const decision = chooseAgent(
      { requested: req.agent ?? 'auto', preferred },
      { isEnabled: (a) => this.config.agents[a].enabled, isAvailable: (a) => this.isAvailable(a), snapshot: (a) => this.ledger.snapshot(a, now) },
      now,
    );
    if (!decision.ok) return { ok: false, refused: true, reason: decision.reason };

    const agent = decision.agent;
    const adapter = getAdapter(agent);
    const binary = this.binaryFor(agent);
    const proc = await runProcess(
      { binary, args: adapter.buildArgs(prompt, this.config.agents[agent].extraArgs), cwd: req.cwd, timeoutMs: timeoutSeconds * 1000, env: this.deps.env },
      this.spawn,
      this.deps.now,
    );

    let result: RunResult;
    if (proc.notFound) {
      this.availability.set(binary, false);
      result = { agent, ok: false, output: `Binary \`${binary}\` not found on PATH. Install ${adapter.displayName} or set agents.${agent}.binary.`, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimated: true }, durationMs: proc.durationMs, exitCode: null };
      return { ...result, routedBy: decision.routedBy };
    }
    const parsed = adapter.parse(proc.stdout, proc.stderr, prompt);
    if (proc.timedOut) {
      result = { agent, ok: false, output: `${adapter.displayName} timed out after ${timeoutSeconds}s.`, usage: parsed.usage, durationMs: proc.durationMs, exitCode: proc.exitCode };
    } else if (proc.exitCode !== 0) {
      result = { agent, ok: false, output: tail(proc.stderr.trim() || parsed.output || `exit code ${proc.exitCode}`), usage: parsed.usage, durationMs: proc.durationMs, exitCode: proc.exitCode };
    } else {
      result = { agent, ok: true, output: parsed.output, usage: parsed.usage, durationMs: proc.durationMs, exitCode: 0 };
    }
    const finished = this.deps.now();
    this.ledger.record({ ts: finished, agent, tokens: result.usage.totalTokens, ok: result.ok, estimated: result.usage.estimated }, finished);
    return { ...result, routedBy: decision.routedBy };
  }
}
