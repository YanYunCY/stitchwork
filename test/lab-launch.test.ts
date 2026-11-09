import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import fc from 'fast-check';
import type { GatewayRunResult, RunOptions, RunRequest } from '../src/gateway.ts';
import { call, startTestLab } from './lab-helpers.ts';

type Lab = Awaited<ReturnType<typeof startTestLab>>;
const JSON_H = { 'Content-Type': 'application/json' };
const post = (t: Lab, path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(t.lab.port, 'POST', path, { headers: { ...t.base, ...JSON_H, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const done: GatewayRunResult = {
  ok: true, agent: 'codex', output: 'x', routedBy: 'auto', fallbacks: [],
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimated: false }, durationMs: 1, exitCode: 0,
};

/** Replace gw.run with a stub whose promise the test settles by hand. */
function stubRun(t: Lab) {
  const calls: { req: RunRequest; opts: RunOptions }[] = [];
  const pending: ((r: GatewayRunResult) => void)[] = [];
  t.gw.run = (req, opts = {}) => {
    calls.push({ req, opts });
    return new Promise<GatewayRunResult>((resolve) => pending.push(resolve));
  };
  return { calls, pending, settle: () => pending.splice(0).forEach((r) => r(done)) };
}

const until = async (f: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('timed out waiting');
};

describe('lab launch (Req 18, 19)', () => {
  const labs: Lab[] = [];
  const start = async (o: Parameters<typeof startTestLab>[0] = {}) => { const t = await startTestLab(o); labs.push(t); return t; };
  afterEach(async () => { await Promise.all(labs.splice(0).map((t) => t.lab.close())); });

  it('runs a skill through the gateway and returns the outcome (Req 18.3, 18.5)', async () => {
    const t = await start({ behaviour: { stdout: 'looks fine\ntokens used: 42\n' } });
    const r = await post(t, '/api/launch', { skill: 'explain', input: 'src/x.ts' });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.agent, 'gemini', 'auto routing honours the skill preference');
    assert.match(r.json.output, /^looks fine/);
    assert.equal(typeof r.json.tokens, 'number');
    assert.deepEqual(r.json.fallbacks, []);
    assert.equal(t.store.lines.length, 1);
    assert.ok(t.spawn.calls[0]?.args.some((a) => /Explain src\/x\.ts/.test(a)));
  });

  it('passes exactly skill, input and agent to Gateway.run (Req 18.3)', async () => {
    const t = await start();
    const s = stubRun(t);
    const p = post(t, '/api/launch', { skill: 'review', input: 'hi', agent: 'claude', extra: 'ignored' });
    await until(() => s.calls.length === 1);
    assert.deepEqual(s.calls[0]?.req, { skill: 'review', input: 'hi', agent: 'claude' });
    s.settle();
    assert.equal((await p).status, 200);
  });

  it('defaults agent to auto and input to empty', async () => {
    const t = await start();
    const s = stubRun(t);
    const p = post(t, '/api/launch', { skill: 'review' });
    await until(() => s.calls.length === 1);
    assert.deepEqual(s.calls[0]?.req, { skill: 'review', input: '', agent: 'auto' });
    s.settle();
    await p;
  });

  it('returns the refusal reason (Req 18.5)', async () => {
    const t = await start({ deps: { which: () => false } });
    const r = await post(t, '/api/launch', { skill: 'review', input: 'x' });
    assert.equal(r.status, 200);
    assert.equal(r.json.refused, true);
    assert.equal(typeof r.json.reason, 'string');
    assert.equal(t.spawn.calls.length, 0);
  });

  it('rejects bad bodies with 400 and never calls the gateway (Req 18.7)', async () => {
    const t = await start();
    const s = stubRun(t);
    const bad: unknown[] = [
      'not json', '[]', 'null', '{}', { skill: 'nope' }, { skill: 7 }, { skill: 'review', input: 5 },
      { skill: 'review', agent: 'cursor' }, { skill: 'review', agent: 3 },
      JSON.stringify({ skill: 'review', input: 'x'.repeat(64 * 1024 + 1) }),
    ];
    for (const b of bad) assert.equal((await post(t, '/api/launch', b as string)).status, 400, String(b).slice(0, 40));
    assert.equal(s.calls.length, 0);
    assert.equal(t.store.lines.length, 0);
  });

  it('accepts a body just under the limit', async () => {
    const t = await start();
    const s = stubRun(t);
    const p = post(t, '/api/launch', JSON.stringify({ skill: 'review', input: 'x'.repeat(60 * 1024) }));
    await until(() => s.calls.length === 1);
    s.settle();
    assert.equal((await p).status, 200);
  });

  it('answers a second launch with 409 while one is running, then frees the slot (Req 18.4)', async () => {
    const t = await start();
    const s = stubRun(t);
    const first = post(t, '/api/launch', { skill: 'review', input: 'a' });
    await until(() => s.calls.length === 1);
    assert.equal((await post(t, '/api/launch', { skill: 'review', input: 'b' })).status, 409);
    assert.equal((await call(t.lab.port, 'GET', '/api/launch/status', { headers: t.base })).json.running, true);
    s.settle();
    assert.equal((await first).status, 200);
    assert.equal((await call(t.lab.port, 'GET', '/api/launch/status', { headers: t.base })).json.running, false);
    const again = post(t, '/api/launch', { skill: 'review', input: 'c' });
    await until(() => s.calls.length === 2);
    s.settle();
    assert.equal((await again).status, 200);
  });

  it('reports the routed agent while running (Req 18.4)', async () => {
    const t = await start();
    const s = stubRun(t);
    const p = post(t, '/api/launch', { skill: 'review', input: 'a' });
    await until(() => s.calls.length === 1);
    s.calls[0]?.opts.onProgress?.({ kind: 'routed', agent: 'claude', message: 'm' });
    const st = await call(t.lab.port, 'GET', '/api/launch/status', { headers: t.base });
    assert.deepEqual(st.json, { running: true, agent: 'claude' });
    s.settle();
    await p;
  });

  it('Cancel aborts the run through the gateway signal (Req 18.6)', async () => {
    const t = await start({ behaviour: { hang: true } });
    const p = post(t, '/api/launch', { skill: 'review', input: 'a' });
    await until(async () => (await call(t.lab.port, 'GET', '/api/launch/status', { headers: t.base })).json.agent !== undefined);
    const c = await post(t, '/api/launch/cancel', {});
    assert.deepEqual(c.json, { cancelled: true });
    const r = await p;
    assert.equal(r.json.cancelled, true);
    assert.equal(r.json.ok, false);
    assert.deepEqual((await post(t, '/api/launch/cancel', {})).json, { cancelled: false });
  });

  it('aborts when the browser disconnects (Req 18.6)', async () => {
    const t = await start();
    const s = stubRun(t);
    const body = JSON.stringify({ skill: 'review', input: 'a' });
    const req = request({ host: '127.0.0.1', port: t.lab.port, method: 'POST', path: '/api/launch', headers: { ...t.base, ...JSON_H, 'Content-Length': String(Buffer.byteLength(body)) } });
    req.on('error', () => {});
    req.end(body);
    await until(() => s.calls.length === 1);
    const signal = s.calls[0]?.opts.signal as AbortSignal;
    assert.equal(signal.aborted, false);
    req.destroy();
    await until(() => signal.aborted);
    s.settle();
  });

  it('returns 500 with the message when the gateway throws, and frees the slot', async () => {
    const t = await start();
    t.gw.run = () => Promise.reject(new Error('boom'));
    const r = await post(t, '/api/launch', { skill: 'review', input: 'a' });
    assert.equal(r.status, 500);
    assert.deepEqual(r.json, { error: 'boom' });
    assert.equal((await call(t.lab.port, 'GET', '/api/launch/status', { headers: t.base })).json.running, false);
  });

  it('refuses cross-origin launches (Req 19.4)', async () => {
    const t = await start();
    const s = stubRun(t);
    const r = await post(t, '/api/launch', { skill: 'review', input: 'a' }, { Origin: 'http://evil.example' });
    assert.equal(r.status, 403);
    const r2 = await post(t, '/api/launch', { skill: 'review', input: 'a' }, { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(r2.status, 403);
    assert.equal(s.calls.length, 0);
  });

  it('--read-only answers 403 and never runs (Req 19.3)', async () => {
    const t = await start({ readOnly: true });
    const s = stubRun(t);
    const r = await post(t, '/api/launch', { skill: 'review', input: 'a' });
    assert.equal(r.status, 403);
    assert.equal(s.calls.length, 0);
    assert.equal((await t.get('/api/state')).json.readOnly, true);
  });

  // Feature: m3-lab, Property 11: single launch
  it('P11: of n concurrent valid launches exactly one runs and n-1 get 409', async () => {
    const t = await start();
    const s = stubRun(t);
    await fc.assert(fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (n) => {
      const before = s.calls.length;
      const all = Array.from({ length: n }, (_, i) => post(t, '/api/launch', { skill: 'review', input: `job ${i}` }));
      await until(() => s.calls.length === before + 1);
      // give the losers time to be answered before releasing the winner
      await new Promise((r) => setTimeout(r, 100));
      s.settle();
      const statuses = (await Promise.all(all)).map((r) => r.status).sort();
      assert.deepEqual(statuses, [200, ...Array(n - 1).fill(409)].sort());
      assert.equal(s.calls.length, before + 1);
      // after it settles a new launch is accepted
      const next = post(t, '/api/launch', { skill: 'review', input: 'next' });
      await until(() => s.calls.length === before + 2);
      s.settle();
      assert.equal((await next).status, 200);
    }), { numRuns: 12 });
  });
});
