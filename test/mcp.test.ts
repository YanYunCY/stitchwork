import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mergeConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import { lineSplitter } from '../src/mcp/jsonrpc.ts';
import { serveMcp } from '../src/mcp/server.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { SkillRegistry } from '../src/skills/registry.ts';
import { fakeSpawn } from './helpers.ts';

type Msg = { id?: number | string | null; result?: any; error?: { code: number; message: string } };

/** Drive the server end-to-end through in-memory stdio (Req 2.x). */
async function session(lines: (string | object)[], config: unknown = {}) {
  const skills = new SkillRegistry();
  skills.add('explain.md', '---\nname: explain\ndescription: Explain code\nagents: [gemini]\n---\nExplain: {{input}}');
  const spawn = fakeSpawn((call) => call.command === 'gemini'
    ? { stdout: JSON.stringify({ response: 'gemini says hi', stats: { models: { m: { tokens: { prompt: 5, candidates: 3, total: 8 } } } } }) }
    : { stdout: JSON.stringify({ result: 'claude says hi', usage: { input_tokens: 20, output_tokens: 5 } }) });
  const store = memoryStore();
  const logs: string[] = [];
  const gw = new Gateway(mergeConfig(config, '/tmp'), { spawn: spawn.fn, store, skills, which: () => true, log: (m) => logs.push(m), now: () => 5_000_000 });
  const input = new PassThrough();
  const output = new PassThrough();
  const out: Msg[] = [];
  const raw: string[] = [];
  const split = lineSplitter((l) => { raw.push(l); out.push(JSON.parse(l)); });
  output.setEncoding('utf8');
  output.on('data', (c: string) => split.push(c));
  const { done } = serveMcp(gw, { input, output, log: (m) => logs.push(m) });
  for (const l of lines) input.write((typeof l === 'string' ? l : JSON.stringify(l)) + '\n');
  input.end();
  await done;
  await new Promise((r) => setImmediate(r));
  return { out, raw, spawn, store, logs, byId: (id: number) => out.find((m) => m.id === id) };
}

const rpc = (id: number, method: string, params?: object) => ({ jsonrpc: '2.0', id, method, params });

describe('MCP server', () => {
  it('completes the initialize handshake (Req 2.1, 2.8)', async () => {
    const s = await session([
      rpc(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'kiro', version: '1' } }),
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      rpc(2, 'ping'),
    ]);
    assert.equal(s.out.length, 2, 'notification gets no response');
    assert.equal(s.byId(1)?.result.protocolVersion, '2025-03-26');
    assert.equal(s.byId(1)?.result.serverInfo.name, 'stitchwork');
    assert.ok(s.byId(1)?.result.capabilities.tools);
    assert.deepEqual(s.byId(2)?.result, {});
  });

  it('falls back to its own protocol version for unknown ones', async () => {
    const s = await session([rpc(1, 'initialize', { protocolVersion: '1999-01-01' })]);
    assert.equal(s.byId(1)?.result.protocolVersion, '2025-06-18');
  });

  it('lists five tools with input schemas (Req 2.2)', async () => {
    const s = await session([rpc(1, 'tools/list')]);
    const tools = s.byId(1)?.result.tools as { name: string; inputSchema: { type: string } }[];
    assert.deepEqual(tools.map((t) => t.name).sort(), ['agent_run', 'agents_list', 'quota_status', 'skill_run', 'skills_list']);
    for (const t of tools) assert.equal(t.inputSchema.type, 'object');
  });

  it('runs an agent, then shows the usage in quota_status (Req 2.3, 3.1, 3.6)', async () => {
    const s = await session([
      rpc(1, 'tools/call', { name: 'agent_run', arguments: { agent: 'claude', prompt: 'say hi' } }),
    ]);
    const r = s.byId(1)?.result;
    assert.equal(r.isError, undefined);
    assert.match(r.content[0].text, /claude says hi/);
    assert.equal(r.structuredContent.usage.totalTokens, 25);
    assert.equal(s.store.lines.length, 1);
    assert.deepEqual(s.spawn.calls[0]?.args, ['-p', 'say hi', '--output-format', 'json']);
  });

  it('runs a skill through its preferred agent', async () => {
    const s = await session([rpc(1, 'tools/call', { name: 'skill_run', arguments: { skill: 'explain', input: 'ledger.ts' } })]);
    assert.match(s.byId(1)?.result.content[0].text, /gemini says hi/);
    assert.equal(s.spawn.calls[0]?.command, 'gemini');
  });

  it('returns isError for refusals instead of protocol errors (Req 2.3)', async () => {
    const s = await session([rpc(1, 'tools/call', { name: 'agent_run', arguments: { agent: 'codex', prompt: 'x' } })], { agents: { codex: { enabled: false } } });
    assert.equal(s.byId(1)?.result.isError, true);
    assert.match(s.byId(1)?.result.content[0].text, /disabled/);
  });

  it('reports quota, agents and skills', async () => {
    const s = await session([
      rpc(1, 'tools/call', { name: 'quota_status', arguments: {} }),
      rpc(2, 'tools/call', { name: 'agents_list' }),
      rpc(3, 'tools/call', { name: 'skills_list', arguments: {} }),
    ], { agents: { claude: { limits: { tokens: 1000 } } } });
    assert.match(s.byId(1)?.result.content[0].text, /claude\s+tokens 0\/1000/);
    assert.equal(s.byId(2)?.result.structuredContent.agents.length, 4);
    assert.match(s.byId(3)?.result.content[0].text, /explain: Explain code \[gemini\]/);
  });

  it('maps protocol problems to JSON-RPC errors (Req 2.4, 2.5, 2.6)', async () => {
    const s = await session([
      '{not json',
      rpc(1, 'resources/list'),
      rpc(2, 'tools/call', { name: 'nope', arguments: {} }),
      rpc(3, 'tools/call', { name: 'agent_run', arguments: {} }),
      rpc(4, 'tools/call', { name: 'agent_run', arguments: { prompt: 'x', agent: 'cursor' } }),
      { foo: 1 },
      rpc(5, 'ping'),
    ]);
    assert.equal(s.out.find((m) => m.id === null && m.error?.code === -32700)?.error?.message, 'Parse error');
    assert.equal(s.byId(1)?.error?.code, -32601);
    assert.equal(s.byId(2)?.error?.code, -32602);
    assert.equal(s.byId(3)?.error?.code, -32602);
    assert.equal(s.byId(4)?.error?.code, -32602);
    assert.ok(s.out.some((m) => m.error?.code === -32600));
    assert.deepEqual(s.byId(5)?.result, {}, 'server keeps serving after errors');
  });

  it('writes only JSON-RPC frames to stdout (Req 2.7)', async () => {
    const s = await session([rpc(1, 'initialize', {}), rpc(2, 'tools/list')]);
    for (const line of s.raw) assert.equal(JSON.parse(line).jsonrpc, '2.0');
    assert.ok(s.logs.some((l) => l.includes('MCP server ready')));
  });
});
