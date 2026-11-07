import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENT_IDS, isAgentId } from './types.ts';
import type { AgentId, Limits } from './types.ts';

export interface AgentConfig {
  enabled: boolean;
  binary?: string;
  extraArgs: string[];
  limits: Limits;
}

export interface StitchworkConfig {
  windowMinutes: number;
  timeoutSeconds: number;
  /** how long a rate-limited agent is skipped (Req 8.2) */
  cooldownMinutes: number;
  /** how many other agents an auto run may fall back to (Req 8.3) */
  maxFallbacks: number;
  ledgerPath: string;
  skillsDir: string;
  agents: Record<AgentId, AgentConfig>;
}

export class ConfigError extends Error {}

export const CONFIG_FILENAME = 'stitchwork.config.json';

export function defaultConfig(baseDir: string = process.cwd()): StitchworkConfig {
  const agents = {} as Record<AgentId, AgentConfig>;
  for (const id of AGENT_IDS) agents[id] = { enabled: true, extraArgs: [], limits: {} };
  return {
    windowMinutes: 300,
    timeoutSeconds: 600,
    cooldownMinutes: 15,
    maxFallbacks: 2,
    ledgerPath: resolve(baseDir, '.stitchwork', 'ledger.jsonl'),
    skillsDir: resolve(baseDir, 'skills'),
    agents,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function positive(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new ConfigError(`${path} must be a positive number`);
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || !v) throw new ConfigError(`${path} must be a non-empty string`);
  return v;
}

/** Merge a parsed JSON object over defaults with field-path errors (Req 6.2). */
export function mergeConfig(raw: unknown, baseDir: string): StitchworkConfig {
  const cfg = defaultConfig(baseDir);
  if (!isObj(raw)) throw new ConfigError('config root must be a JSON object');
  if (raw.windowMinutes !== undefined) cfg.windowMinutes = positive(raw.windowMinutes, 'windowMinutes');
  if (raw.timeoutSeconds !== undefined) cfg.timeoutSeconds = positive(raw.timeoutSeconds, 'timeoutSeconds');
  if (raw.cooldownMinutes !== undefined) cfg.cooldownMinutes = positive(raw.cooldownMinutes, 'cooldownMinutes');
  if (raw.maxFallbacks !== undefined) {
    const v = raw.maxFallbacks;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 3) throw new ConfigError('maxFallbacks must be an integer from 0 to 3');
    cfg.maxFallbacks = v;
  }
  if (raw.ledgerPath !== undefined) cfg.ledgerPath = resolve(baseDir, str(raw.ledgerPath, 'ledgerPath'));
  if (raw.skillsDir !== undefined) cfg.skillsDir = resolve(baseDir, str(raw.skillsDir, 'skillsDir'));
  if (raw.agents !== undefined) {
    if (!isObj(raw.agents)) throw new ConfigError('agents must be an object');
    for (const [id, value] of Object.entries(raw.agents)) {
      const p = `agents.${id}`;
      if (!isAgentId(id)) throw new ConfigError(`${p} is not a known agent (${AGENT_IDS.join(', ')})`);
      if (!isObj(value)) throw new ConfigError(`${p} must be an object`);
      const a = cfg.agents[id];
      if (value.enabled !== undefined) {
        if (typeof value.enabled !== 'boolean') throw new ConfigError(`${p}.enabled must be a boolean`);
        a.enabled = value.enabled;
      }
      if (value.binary !== undefined) a.binary = str(value.binary, `${p}.binary`);
      if (value.extraArgs !== undefined) {
        if (!Array.isArray(value.extraArgs) || !value.extraArgs.every((x) => typeof x === 'string')) {
          throw new ConfigError(`${p}.extraArgs must be an array of strings`);
        }
        a.extraArgs = [...value.extraArgs];
      }
      if (value.limits !== undefined) {
        if (!isObj(value.limits)) throw new ConfigError(`${p}.limits must be an object`);
        if (value.limits.tokens !== undefined) a.limits.tokens = positive(value.limits.tokens, `${p}.limits.tokens`);
        if (value.limits.requests !== undefined) a.limits.requests = positive(value.limits.requests, `${p}.limits.requests`);
      }
    }
  }
  return cfg;
}

export function loadConfig(path?: string, baseDir: string = process.cwd()): StitchworkConfig {
  const file = resolve(baseDir, path ?? CONFIG_FILENAME);
  if (!existsSync(file)) {
    if (path) throw new ConfigError(`config file not found: ${file}`);
    return defaultConfig(baseDir);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new ConfigError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  return mergeConfig(raw, baseDir);
}
