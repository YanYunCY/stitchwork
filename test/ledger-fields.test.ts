import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mergeConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import { QuotaLedger, memoryStore, parseEvent } from '../src/quota/ledger.ts';
import type { UsageEvent } from '../src/quota/ledger.ts';
import { SkillRegistry } from '../src/skills/registry.ts';
import { AGENT_IDS } from '../src/types.ts';
import { fakeSpawn } from './helpers.ts';

const ALLOWED_KEYS = ['ts', 'agent', 'tokens', 'ok', 'estimated', 'rateLimited', 'durationMs', 'fallbacks'];

const eventArb: fc.Arbitrary<UsageEvent> = fc.record({
  ts: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  agent: fc.constantFrom(...AGENT_IDS),
  tokens: fc.nat({ max: 10_000_000 }),
  ok: fc.boolean(),
  estimated: fc.boolean(),
}).chain((base) => fc.record({
  rateLimited: fc.option(fc.constant(true), { nil: undefined }),
  durationMs: fc.option(fc.double({ min: 0, max: 1e7, noNaN: true }), { nil: undefined }),
  fallbacks: fc.option(fc.double({ min: 0, max: 5, noNaN: true }), { nil: undefined }),
}).map((opt) => {
  const e: UsageEvent = { ...base };
  if (opt.rateLimited) e.rateLimited = true;
  if (opt.durationMs !== undefined) e.durationMs = opt.durationMs;
  if (opt.fallbacks !== undefined) e.fallbacks = opt.fallbacks;
  return e;
}));

describe('ledger durationMs and fallbacks (Req 17.2, 17.5)', () => {
  it('old lines without the new fields stay valid', () => {
    const e = parseEvent('{"ts":5,"agent":"codex","tokens":3,"ok":true,"estimated":false}');
    assert.deepEqual(e, { ts: 5, agent: 'codex', tokens: 3, ok: true, estimated: false });
  });

  it('ignores invalid optional fields and a zero fallback count', () => {
    const e = parseEvent('{"ts":5,"agent":"codex","tokens":3,"durationMs":-4,"fallbacks":0}');
    assert.equal(e?.durationMs, undefined);
    assert.equal(e?.fallbacks, undefined);
  });

  // Feature: m3-lab, Property 8: ledger round trip and privacy
  it('P8: round trips with normalised fields and writes no other keys', () => {
    fc.assert(fc.property(eventArb, (e) => {
      const store = memoryStore();
      new QuotaLedger({}, 60_000, store).record(e, e.ts);
      const line = store.lines[0] as string;
      const keys = Object.keys(JSON.parse(line) as object);
      assert.ok(keys.every((k) => ALLOWED_KEYS.includes(k)), keys.join());
      const expected: UsageEvent = { ts: e.ts, agent: e.agent, tokens: e.tokens, ok: e.ok, estimated: e.estimated };
      if (e.rateLimited) expected.rateLimited = true;
      if (e.durationMs !== undefined) expected.durationMs = Math.round(e.durationMs);
      if (e.fallbacks !== undefined && Math.round(e.fallbacks) > 0) expected.fallbacks = Math.round(e.fallbacks);
      assert.deepEqual(parseEvent(line), expected);
    }), { numRuns: 200 });
  });
});

describe('Gateway records durationMs and fallbacks (Req 17.2)', () => {
  function make(limitedBinary?: string) {
    const store = memoryStore();
    const spawn = fakeSpawn((call) => (call.command === limitedBinary
      ? { stderr: 'Error: 429 Too Many Requests', exitCode: 1 }
      : { stdout: 'fine\ntokens used: 10\n', exitCode: 0 }));
    let t = 9_000_000;
    const gw = new Gateway(mergeConfig({}, '/tmp'), {
      spawn: spawn.fn, store, skills: new SkillRegistry(), now: () => (t += 250), which: () => true, env: {}, log: () => {},
    });
    return { gw, store };
  }

  it('records duration and omits fallbacks for a first-try success', async () => {
    const { gw, store } = make();
    await gw.run({ agent: 'codex', prompt: 'x' });
    const e = parseEvent(store.lines[0] as string);
    assert.equal(typeof e?.durationMs, 'number');
    assert.equal(e?.fallbacks, undefined);
  });

  it('records the abandoned attempt and the taker-over separately', async () => {
    const { gw, store } = make('codex');
    await gw.run({ agent: 'auto', prompt: 'x' });
    const [first, second] = store.lines.map((l) => parseEvent(l));
    assert.equal(first?.agent, 'codex');
    assert.equal(first?.rateLimited, true);
    assert.equal(first?.fallbacks, undefined);
    assert.equal(second?.agent, 'claude');
    assert.equal(second?.fallbacks, 1);
  });
});
