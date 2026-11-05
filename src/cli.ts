import { realpathSync } from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './config.ts';
import { Gateway } from './gateway.ts';
import type { GatewayDeps } from './gateway.ts';
import { serveMcp } from './mcp/server.ts';
import { callTool } from './mcp/tools.ts';
import { AGENT_IDS, isAgentId } from './types.ts';
import type { AgentId } from './types.ts';

export const USAGE = `🧟 stitchwork — one MCP gateway for codex, claude, gemini and opencode

Usage:
  stitchwork serve                         start the MCP server on stdio
  stitchwork agents                        list agents, install state, quota headroom
  stitchwork quota                         usage per agent in the current window
  stitchwork skills                        list reusable skills
  stitchwork run [--agent <id|auto>] [--skill <name>] [--cwd <dir>] <prompt...>

Options:
  --config <file>   config file (default ./stitchwork.config.json)
  -h, --help        show this help

Agents: ${AGENT_IDS.join(', ')}. API keys are read from the environment only.`;

export interface CliIO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  stdin?: Readable;
  stdoutStream?: Writable;
}

interface Parsed { command?: string; flags: Record<string, string>; rest: string[] }

export function parseArgs(argv: readonly string[]): Parsed {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  let command: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '-h' || a === '--help') flags.help = 'true';
    else if (a === '--') { rest.push(...argv.slice(i + 1)); break; }
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else flags[a.slice(2)] = argv[++i] ?? '';
    } else if (!command) command = a;
    else rest.push(a);
  }
  return { command, flags, rest };
}

/** Returns the process exit code. */
export async function main(argv: readonly string[], io: CliIO, deps: GatewayDeps = {}): Promise<number> {
  const { command, flags, rest } = parseArgs(argv);
  if (flags.help || !command) {
    io.stdout(USAGE + '\n');
    return flags.help ? 0 : 2;
  }
  if (!['serve', 'agents', 'quota', 'skills', 'run'].includes(command)) {
    io.stderr(`Unknown command: ${command}\n\n${USAGE}\n`);
    return 2;
  }
  let gw: Gateway;
  try {
    gw = new Gateway(loadConfig(flags.config), { log: (m) => io.stderr(`[stitchwork] ${m}\n`), ...deps });
  } catch (e) {
    if (e instanceof ConfigError) {
      io.stderr(`Config error: ${e.message}\n`);
      return 1;
    }
    throw e;
  }

  if (command === 'serve') {
    const { done } = serveMcp(gw, {
      input: io.stdin ?? process.stdin,
      output: io.stdoutStream ?? process.stdout,
      log: (m) => io.stderr(`[stitchwork] ${m}\n`),
    });
    await done;
    return 0;
  }

  const toolFor: Record<string, string> = { agents: 'agents_list', quota: 'quota_status', skills: 'skills_list' };
  const tool = toolFor[command];
  if (tool) {
    const r = await callTool(gw, tool, {});
    io.stdout((r.content[0]?.text ?? '') + '\n');
    return 0;
  }

  // run
  const agentFlag = flags.agent ?? 'auto';
  if (agentFlag !== 'auto' && !isAgentId(agentFlag)) {
    io.stderr(`--agent must be one of ${[...AGENT_IDS, 'auto'].join(', ')}\n`);
    return 2;
  }
  const text = rest.join(' ');
  if (!text && !flags.skill) {
    io.stderr('run needs a prompt.\n');
    return 2;
  }
  const r = await gw.run({ agent: agentFlag as AgentId | 'auto', prompt: text, skill: flags.skill, input: text, cwd: flags.cwd });
  if (r.refused) {
    io.stderr(`Refused: ${r.reason}\n`);
    return 1;
  }
  io.stdout(r.output + '\n');
  io.stderr(`— ${r.agent} (${r.routedBy}) · ${r.usage.totalTokens} tokens${r.usage.estimated ? ' (estimated)' : ''} · ${(r.durationMs / 1000).toFixed(1)}s\n`);
  return r.ok ? 0 : 1;
}

/** Entry point used by bin/stitchwork.js and `node src/cli.ts`. */
export function run(argv: readonly string[] = process.argv.slice(2)): void {
  main(argv, { stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s) })
    .then((code) => { process.exitCode = code; })
    .catch((e: unknown) => { process.stderr.write(`${(e as Error).stack ?? String(e)}\n`); process.exitCode = 1; });
}

function invokedDirectly(): boolean {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (invokedDirectly()) run();
