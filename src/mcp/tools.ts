import type { Gateway, GatewayRunResult } from '../gateway.ts';
import { AGENT_IDS } from '../types.ts';
import type { AgentId } from '../types.ts';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
}

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

const agentEnum = { type: 'string', enum: [...AGENT_IDS, 'auto'], default: 'auto', description: 'Which agent runs the prompt; "auto" picks the one with most quota headroom.' };
const cwdProp = { type: 'string', description: 'Working directory for the agent (defaults to the gateway cwd).' };

export const TOOLS: ToolDef[] = [
  { name: 'agents_list', description: 'List the stitched-in coding agents, whether each CLI is installed, and its remaining quota.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'agent_run',
    description: 'Run a prompt on Codex CLI, Claude Code, Gemini CLI or OpenCode through one interface. Usage is charged to the shared quota ledger.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string', description: 'The task for the agent.' }, agent: agentEnum, cwd: cwdProp }, required: ['prompt'], additionalProperties: false },
  },
  { name: 'skills_list', description: 'List reusable skills and the agents each prefers.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'skill_run',
    description: 'Render a reusable skill with your input and run it through the router.',
    inputSchema: { type: 'object', properties: { skill: { type: 'string' }, input: { type: 'string' }, agent: agentEnum, cwd: cwdProp }, required: ['skill', 'input'], additionalProperties: false },
  },
  { name: 'quota_status', description: 'Show token and request usage per agent in the current rolling window.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

const text = (t: string, isError = false, structuredContent?: Record<string, unknown>): ToolResult =>
  ({ content: [{ type: 'text', text: t }], ...(structuredContent ? { structuredContent } : {}), ...(isError ? { isError: true } : {}) });

const pct = (h: number) => `${Math.round(h * 100)}%`;
const until = (t: number | null) => (t === null ? '' : ` · cooling until ${new Date(t).toISOString().slice(11, 16)}Z`);
const lim = (used: number, limit: number | null) => (limit === null ? `${used}` : `${used}/${limit}`);

function formatRun(r: GatewayRunResult): ToolResult {
  if (r.refused) return text(`Refused: ${r.reason}`, true);
  const u = r.usage;
  const via = r.fallbacks.length ? ` · fell back from ${r.fallbacks.map((f) => `${f.agent} (${f.reason})`).join(', ')}` : '';
  const footer = `\n\n— ${r.agent} (${r.routedBy}) · ${u.totalTokens} tokens${u.estimated ? ' (estimated)' : ''} · ${(r.durationMs / 1000).toFixed(1)}s${via}`;
  return text(r.output + footer, !r.ok, {
    agent: r.agent, ok: r.ok, routedBy: r.routedBy, usage: { ...u }, durationMs: r.durationMs, exitCode: r.exitCode,
    fallbacks: r.fallbacks.map((f) => ({ ...f })), ...(r.rateLimited ? { rateLimited: true } : {}), ...(r.cancelled ? { cancelled: true } : {}),
  });
}

export async function callTool(gw: Gateway, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const agent = (typeof args.agent === 'string' ? args.agent : 'auto') as AgentId | 'auto';
  const cwd = typeof args.cwd === 'string' ? args.cwd : undefined;
  switch (name) {
    case 'agents_list': {
      const rows = gw.agents().map((a) =>
        `${a.id.padEnd(9)} ${a.enabled ? 'enabled ' : 'disabled'} ${a.available ? 'installed' : 'missing  '} headroom ${pct(a.quota.headroom)}${a.quota.exhausted ? ' EXHAUSTED' : ''}${a.quota.coolingUntil !== null ? ' COOLING' : ''}`);
      return text(rows.join('\n'), false, { agents: gw.agents().map((a) => ({ id: a.id, name: a.name, enabled: a.enabled, available: a.available, headroom: a.quota.headroom })) });
    }
    case 'quota_status': {
      const q = gw.quota();
      const rows = q.map((s) => `${s.agent.padEnd(9)} tokens ${lim(s.usedTokens, s.tokenLimit)} · requests ${lim(s.usedRequests, s.requestLimit)} · headroom ${pct(s.headroom)}${s.exhausted ? ' · EXHAUSTED' : ''}${until(s.coolingUntil)}`);
      return text(`Window: ${gw.config.windowMinutes} min\n` + rows.join('\n'), false, { windowMinutes: gw.config.windowMinutes, agents: q.map((s) => ({ ...s })) });
    }
    case 'skills_list': {
      const s = gw.skills.list();
      if (!s.length) return text('No skills found.');
      return text(s.map((k) => `${k.name}: ${k.description}${k.agents.length ? ` [${k.agents.join(', ')}]` : ''}`).join('\n'), false,
        { skills: s.map((k) => ({ name: k.name, description: k.description, agents: k.agents })) });
    }
    case 'agent_run':
      return formatRun(await gw.run({ agent, prompt: String(args.prompt), cwd }));
    case 'skill_run':
      return formatRun(await gw.run({ agent, skill: String(args.skill), input: String(args.input), cwd }));
    default:
      throw new Error(`unreachable tool ${name}`);
  }
}
