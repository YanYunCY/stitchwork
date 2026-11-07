import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { mergeConfig } from './config.ts';
import { Gateway } from './gateway.ts';
import type { GatewayRunResult, RunRequest } from './gateway.ts';
import { callTool } from './mcp/tools.ts';
import { AGENT_IDS } from './types.ts';

export const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
export const FAKE_AGENTS_DIR = join(PACKAGE_ROOT, 'examples', 'fake-agents');

export interface DemoIO {
  out: (s: string) => void;
  color: boolean;
  paceMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const paint = (on: boolean) => ({
  title: (s: string) => (on ? `\x1b[1;35m${s}\x1b[0m` : s),
  step: (s: string) => (on ? `\x1b[1;36m${s}\x1b[0m` : s),
  ok: (s: string) => (on ? `\x1b[32m${s}\x1b[0m` : s),
  bad: (s: string) => (on ? `\x1b[31m${s}\x1b[0m` : s),
  dim: (s: string) => (on ? `\x1b[2m${s}\x1b[0m` : s),
});

/**
 * Scripted, self-contained demo (Req 12): bundled stand-in CLIs, a temp ledger,
 * no real agent, no user config, no user ledger. Returns an exit code.
 */
export async function runDemo(io: DemoIO): Promise<number> {
  const c = paint(io.color);
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pause = () => (io.paceMs > 0 ? sleep(io.paceMs) : Promise.resolve());

  for (const id of AGENT_IDS) {
    if (!existsSync(join(FAKE_AGENTS_DIR, id))) {
      io.out(c.bad(`Demo agents are missing: ${join(FAKE_AGENTS_DIR, id)}. Reinstall Stitchwork.\n`));
      return 1;
    }
  }

  const dir = mkdtempSync(join(tmpdir(), 'stitchwork-demo-'));
  const env: NodeJS.ProcessEnv = {
    PATH: [dirname(process.execPath), process.env.PATH ?? ''].filter(Boolean).join(delimiter),
    ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
  };
  const config = mergeConfig({
    windowMinutes: 60,
    cooldownMinutes: 15,
    ledgerPath: join(dir, 'ledger.jsonl'),
    skillsDir: join(PACKAGE_ROOT, 'skills'),
    agents: {
      claude: { binary: join(FAKE_AGENTS_DIR, 'claude'), limits: { tokens: 3000, requests: 2 } },
      codex: { binary: join(FAKE_AGENTS_DIR, 'codex'), limits: { tokens: 6000 } },
      gemini: { binary: join(FAKE_AGENTS_DIR, 'gemini'), limits: { requests: 10 } },
      opencode: { binary: join(FAKE_AGENTS_DIR, 'opencode'), limits: { requests: 10 } },
    },
  }, dir);
  const gw = new Gateway(config, { env, log: () => {} });

  const show = async (label: string, req: RunRequest) => {
    io.out(`\n${c.step('▶ ' + label)}\n`);
    const r: GatewayRunResult = await gw.run(req, {
      onProgress: (e) => { if (e.kind === 'fallback') io.out(c.dim(`  ↪ ${e.message}\n`)); },
    });
    if (r.refused) {
      io.out(c.bad(`  ✘ Refused: ${r.reason}\n`));
    } else {
      const via = r.fallbacks.length ? ` · fell back from ${r.fallbacks.map((f) => `${f.agent} (${f.reason})`).join(', ')}` : '';
      io.out(`  ${r.ok ? c.ok('✔') : c.bad('✘')} ${r.output.split('\n')[0]}\n`);
      io.out(c.dim(`  — ${r.agent} (${r.routedBy}) · ${r.usage.totalTokens} tokens${via}\n`));
    }
    await pause();
    return r;
  };

  try {
    io.out(c.title('🧟 Stitchwork demo — four coding agents, one gateway, one shared quota\n'));
    io.out(c.dim(`   stand-in CLIs from examples/fake-agents · temp ledger ${config.ledgerPath}\n`));
    await pause();

    io.out(`\n${c.step('▶ The limbs: stitchwork agents')}\n`);
    io.out((await callTool(gw, 'agents_list', {})).content[0]?.text.replace(/^/gm, '  ') + '\n');
    await pause();

    await show('Claude, task 1 (limit: 2 requests / 3000 tokens per hour)', { agent: 'claude', prompt: 'Refactor the auth middleware into small functions' });
    await show('Claude, task 2', { agent: 'claude', prompt: 'Write unit tests for the refactored middleware' });
    await show('Claude, task 3: the ledger says no', { agent: 'claude', prompt: 'Now add rate limiting to the API' });
    await show('Same task with agent "auto": routed by quota headroom', { agent: 'auto', prompt: 'Now add rate limiting to the API' });

    env.STITCHWORK_FAKE_RATE_LIMIT = 'gemini';
    await show('Skill "explain" prefers Gemini, but Gemini answers 429', { skill: 'explain', input: 'src/quota/ledger.ts' });
    delete env.STITCHWORK_FAKE_RATE_LIMIT;
    await show('Next request skips Gemini while it cools down', { skill: 'explain', input: 'src/router.ts' });

    io.out(`\n${c.step('▶ One ledger for every agent: stitchwork quota')}\n`);
    io.out((await callTool(gw, 'quota_status', {})).content[0]?.text.replace(/^/gm, '  ') + '\n');
    io.out(`\n${c.title('It\'s alive.')} Connect it to Kiro with: ${c.dim('{"mcpServers":{"stitchwork":{"command":"stitchwork","args":["serve"]}}}')}\n`);
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
