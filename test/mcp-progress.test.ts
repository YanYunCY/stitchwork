import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mergeConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import { lineSplitter } from '../src/mcp/jsonrpc.ts';
import { progressReporter, serveMcp } from '../src/mcp/server.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { SkillRegistry } from '../src/skills/registry.ts';
import { fakeSpawn } from './helpers.ts';
import type { FakeBehaviour } from './helpers.ts';

type Frame = { id?: number; method?: string; params?: any; result?: any; error?: any };

function harness(behaviour: (bin: string) => FakeBehaviour) {
  const spawn = fakeSpawn((c) => behaviour(c.command));
  const store = memoryStore();
  const gw = new Gateway(mergeConfig({}, '/tmp'), { spawn: spawn.fn, store, skills: new SkillRegistry(), which: () => true, log: () => {}, env: {} });
  const input = new PassThrough();
  const output = new PassThrough();
  const frames: Frame[] = [];
  const split = lineSplitter((l) => frames.push(JSON.parse(l)));
  output.setEncoding('utf8');
  output.on('data', (c: string) => split.push(c));
  const { done } = serveMcp(gw, { input, output, log: () => {} });
  const write = (m: object) => input.write(JSON.stringify(m) + '\n');
  const finish = async () => { input.end(); await done; await new Promise((r) => setImmediate(r)); };
  return { frames, write, finish, spawn, store };
}

const call = (id: number, args: object, meta?: object) =>
  ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'agent_run', arguments: args, ...(meta ? { _meta: meta } : {}) } });

describe('MCP progress notifications (Req 9)', () => {
  it('sends progress frames with the token and an increasing counter before the result', async () => {
    const h = harness((b) => (b === 'codex' ? { stderr: 'rate limit exceeded', exitCode: 1 } : { stdout: '{"result":"done","usage":{"input_tokens":1,"output_tokens":1}}' }));
    h.write(call(1, { prompt: 'go' }, { progressToken: 'tok-1' }));
    await h.finish();
    const progress = h.frames.filter((f) => f.method === 'notifications/progress');
    assert.ok(progress.length >= 4, `got ${progress.length}`);
    assert.ok(progress.every((f) => f.params.progressToken === 'tok-1'));
    const counters = progress.map((f) => f.params.progress as number);
    assert.deepEqual(counters, [...counters].sort((a, b) => a - b));
    assert.equal(new Set(counters).size, counters.length);
    assert.ok(progress.some((f) => /rate-limited/.test(f.params.message)));
    const resultIndex = h.frames.findIndex((f) => f.id === 1);
    assert.equal(resultIndex, h.frames.length - 1);
    assert.deepEqual(h.frames[resultIndex]?.result.structuredContent.fallbacks, [{ agent: 'codex', reason: 'rate-limited' }]);
  });

  it('sends no progress frames without a token (Req 9.5)', async () => {
    const h = harness(() => ({ stdout: 'hi\ntokens used: 3' }));
    h.write(call(1, { prompt: 'go', agent: 'codex' }));
    await h.finish();
    assert.equal(h.frames.filter((f) => f.method).length, 0);
    assert.equal(h.frames.length, 1);
  });

  it('truncates messages to 200 characters and throttles output frames (Req 9.3, 9.4)', () => {
    const sent: any[] = [];
    let t = 0;
    const report = progressReporter(7, (m) => sent.push(m), () => t);
    report({ kind: 'routed', agent: 'claude', message: 'x'.repeat(500) });
    report({ kind: 'output', agent: 'claude', message: 'a' });
    t = 100;
    report({ kind: 'output', agent: 'claude', message: 'b' });
    t = 300;
    report({ kind: 'output', agent: 'claude', message: 'c' });
    report({ kind: 'done', agent: 'claude', message: 'ok' });
    assert.equal(sent[0].params.message.length, 200);
    assert.deepEqual(sent.map((m) => m.params.progress), [1, 2, 3, 4]);
    assert.deepEqual(sent.slice(1, 3).map((m) => m.params.message), ['a', 'c']);
  });
});

describe('MCP cancellation (Req 10)', () => {
  it('kills the agent, sends no response for the cancelled id, and records ok:false', async () => {
    const h = harness(() => ({ hang: true }));
    h.write(call(5, { prompt: 'long', agent: 'claude' }));
    await new Promise((r) => setTimeout(r, 20));
    h.write({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 5, reason: 'user' } });
    h.write({ jsonrpc: '2.0', id: 6, method: 'ping' });
    await h.finish();
    assert.deepEqual(h.spawn.signals, ['SIGTERM']);
    assert.equal(h.frames.find((f) => f.id === 5), undefined);
    assert.deepEqual(h.frames.find((f) => f.id === 6)?.result, {});
    assert.ok(h.store.lines[0]?.includes('"ok":false'));
  });

  it('ignores a cancel for an unknown request (Req 10.4)', async () => {
    const h = harness(() => ({ stdout: 'hi\ntokens used: 3' }));
    h.write({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 99 } });
    h.write(call(1, { prompt: 'go', agent: 'codex' }));
    await h.finish();
    assert.equal(h.frames.find((f) => f.id === 1)?.result.isError, undefined);
  });
});
