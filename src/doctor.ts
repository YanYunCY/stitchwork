import type { Gateway } from './gateway.ts';
import { runProcess } from './runner.ts';
import type { SpawnFn } from './runner.ts';

export interface DoctorRow {
  agent: string;
  binary: string;
  onPath: boolean;
  version: string;
  enabled: boolean;
  limits: string;
}

export const MCP_SNIPPET = JSON.stringify({ mcpServers: { stitchwork: { command: 'stitchwork', args: ['serve'] } } }, null, 2);

const VERSION_TIMEOUT_MS = 5000;

/** Health check for each stitched-in CLI (Req 11.1). Never throws. */
export async function doctor(gw: Gateway, spawn?: SpawnFn): Promise<DoctorRow[]> {
  return Promise.all(gw.agents().map(async (a) => {
    const lim = gw.config.agents[a.id].limits;
    const limits = [lim.tokens ? `${lim.tokens} tokens` : '', lim.requests ? `${lim.requests} requests` : ''].filter(Boolean).join(', ') || 'unlimited';
    let version = '—';
    if (a.available) {
      const p = await runProcess({ binary: a.binary, args: ['--version'], timeoutMs: VERSION_TIMEOUT_MS }, spawn);
      if (p.timedOut) version = `(no answer in ${VERSION_TIMEOUT_MS / 1000}s)`;
      else version = (p.stdout.trim() || p.stderr.trim()).split('\n')[0]?.slice(0, 60) || `(exit ${p.exitCode})`;
    }
    return { agent: a.id, binary: a.binary, onPath: a.available, version, enabled: a.enabled, limits };
  }));
}

export function formatDoctor(rows: DoctorRow[], windowMinutes: number): string {
  const lines = rows.map((r) =>
    `${r.onPath && r.enabled ? '✔' : '✘'} ${r.agent.padEnd(9)} ${(r.onPath ? r.binary : `${r.binary} (not on PATH)`).padEnd(28)} ${r.version.padEnd(40)} ${r.enabled ? 'enabled ' : 'disabled'}  ${r.limits}`);
  const ready = rows.filter((r) => r.onPath && r.enabled).length;
  return [
    `Agents (window ${windowMinutes} min):`,
    ...lines,
    '',
    `${ready} of ${rows.length} agents ready.${ready === 0 ? ' Install at least one CLI, or try `stitchwork demo` with the bundled stand-ins.' : ''}`,
    '',
    'Add Stitchwork to an MCP client (Kiro: .kiro/settings/mcp.json):',
    MCP_SNIPPET,
  ].join('\n');
}
