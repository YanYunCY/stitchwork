import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { gaugeFill } from '../src/lab/gauge.ts';
import { recentRuns } from '../src/lab/runs.ts';
import { parseEvent } from '../src/quota/ledger.ts';
import type { UsageEvent } from '../src/quota/ledger.ts';
import { AGENT_IDS } from '../src/types.ts';

const eventArb: fc.Arbitrary<UsageEvent> = fc.record({
  ts: fc.integer({ min: 0, max: 1000 }),
  agent: fc.constantFrom(...AGENT_IDS),
  tokens: fc.nat({ max: 5000 }),
  ok: fc.boolean(),
  estimated: fc.boolean(),
});
const lineArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: eventArb.map((e) => JSON.stringify(e)) },
  { weight: 2, arbitrary: eventArb.chain((e) => fc.record({ d: fc.nat(9999), f: fc.integer({ min: 1, max: 3 }) }).map((x) => JSON.stringify({ ...e, durationMs: x.d, fallbacks: x.f }))) },
  { weight: 1, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.constantFrom('', '   ', '{"ts":"x"}', '{"ts":1,"agent":"cursor","tokens":1}', '[1]') },
);

describe('recentRuns (Req 17.1, 17.3)', () => {
  it('returns newest first and tolerates garbage', () => {
    const rows = recentRuns(['nope', '{"ts":1,"agent":"codex","tokens":1}', '{"ts":3,"agent":"claude","tokens":2}', '']);
    assert.deepEqual(rows.map((r) => r.ts), [3, 1]);
  });

  it('puts the later line first on equal timestamps', () => {
    const rows = recentRuns(['{"ts":5,"agent":"codex","tokens":1,"rateLimited":true}', '{"ts":5,"agent":"claude","tokens":1}']);
    assert.deepEqual(rows.map((r) => r.agent), ['claude', 'codex']);
  });

  // Feature: m3-lab, Property 7: recent runs
  it('P7: length min(20, valid), sorted desc, equals the last 20 valid events by ts', () => {
    fc.assert(fc.property(fc.array(lineArb, { maxLength: 80 }), (lines) => {
      const valid = lines.map((l, i) => ({ e: parseEvent(l), i })).filter((x): x is { e: UsageEvent; i: number } => x.e !== undefined);
      const rows = recentRuns(lines, 20);
      assert.equal(rows.length, Math.min(20, valid.length));
      for (let k = 1; k < rows.length; k++) assert.ok((rows[k - 1] as UsageEvent).ts >= (rows[k] as UsageEvent).ts);
      const model = valid.sort((a, b) => a.e.ts - b.e.ts || a.i - b.i).slice(-20).reverse().map((x) => x.e);
      assert.deepEqual(rows, model);
    }), { numRuns: 200 });
  });
});

describe('gaugeFill (Req 16.2, 16.3)', () => {
  it('is null without a limit and 0 for a zero limit', () => {
    assert.equal(gaugeFill(10, null), null);
    assert.equal(gaugeFill(10, 0), 0);
  });

  // Feature: m3-lab, Property 12: gauge fill
  it('P12: stays in [0,1] and never increases with usage', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1e9, noNaN: true }), fc.double({ min: 0, max: 1e9, noNaN: true }), fc.double({ min: 1e-3, max: 1e9, noNaN: true }), (a, b, limit) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      const flo = gaugeFill(lo, limit) as number;
      const fhi = gaugeFill(hi, limit) as number;
      assert.ok(flo >= 0 && flo <= 1 && fhi >= 0 && fhi <= 1);
      assert.ok(fhi <= flo);
    }), { numRuns: 300 });
  });
});
