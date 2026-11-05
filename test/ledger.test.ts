import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { QuotaLedger, fileStore, memoryStore } from '../src/quota/ledger.ts';
import type { UsageEvent } from '../src/quota/ledger.ts';
import { AGENT_IDS } from '../src/types.ts';

const MIN = 60_000;
const ev = (ts: number, agent: UsageEvent['agent'], tokens: number): UsageEvent =>
  ({ ts, agent, tokens, ok: true, estimated: false });

describe('QuotaLedger', () => {
  it('counts only events inside the rolling window (Req 3.4)', () => {
    const l = new QuotaLedger({}, 60 * MIN, memoryStore());
    l.record(ev(0, 'claude', 100), 0);
    l.record(ev(30 * MIN, 'claude', 50), 30 * MIN);
    const s = l.snapshot('claude', 70 * MIN);
    assert.equal(s.usedTokens, 50);
    assert.equal(s.usedRequests, 1);
    assert.equal(s.resetsAt, 90 * MIN);
  });

  it('treats missing limits as unlimited (Req 3.7)', () => {
    const l = new QuotaLedger({}, MIN, memoryStore());
    l.record(ev(1, 'gemini', 1e9), 1);
    const s = l.snapshot('gemini', 2);
    assert.equal(s.headroom, 1);
    assert.equal(s.exhausted, false);
    assert.equal(s.tokenLimit, null);
  });

  it('marks an agent exhausted at the token or request limit (Req 3.5)', () => {
    const l = new QuotaLedger({ codex: { tokens: 100, requests: 5 } }, MIN, memoryStore());
    l.record(ev(1, 'codex', 60), 1);
    assert.equal(l.snapshot('codex', 2).headroom, 0.4);
    l.record(ev(2, 'codex', 40), 2);
    assert.equal(l.snapshot('codex', 3).exhausted, true);
    assert.equal(l.snapshot('codex', 3).headroom, 0);
  });

  it('persists counts only, as JSONL, and reloads ignoring bad lines (Req 3.2, 3.3, 3.8)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stitchwork-'));
    const path = join(dir, 'sub', 'ledger.jsonl');
    const a = new QuotaLedger({}, MIN, fileStore(path));
    a.record({ ...ev(5, 'opencode', 12), prompt: 'secret' } as UsageEvent, 5);
    const raw = readFileSync(path, 'utf8');
    assert.ok(!raw.includes('secret'));
    writeFileSync(path, raw + 'not json\n{"ts":"x"}\n');
    const b = new QuotaLedger({}, MIN, fileStore(path));
    assert.equal(b.snapshot('opencode', 6).usedTokens, 12);
  });

  it('reports all four agents', () => {
    const l = new QuotaLedger({}, MIN, memoryStore());
    assert.deepEqual(l.snapshotAll(0).map((s) => s.agent), [...AGENT_IDS]);
  });
});

describe('QuotaLedger properties', () => {
  const agentArb = fc.constantFrom(...AGENT_IDS);
  const eventsArb = fc.array(
    fc.record({ ts: fc.integer({ min: 0, max: 1000 }), agent: agentArb, tokens: fc.integer({ min: 0, max: 500 }) }),
    { maxLength: 40 },
  );

  it('P1: used tokens equals the sum of in-window events', () => {
    fc.assert(fc.property(eventsArb, fc.integer({ min: 0, max: 1200 }), agentArb, (events, now, agent) => {
      const window = 300;
      const store = memoryStore(events.map((e) => JSON.stringify({ ...e, ok: true })));
      const l = new QuotaLedger({}, window, store);
      const expected = events
        .filter((e) => e.agent === agent && e.ts > now - window && e.ts <= now)
        .reduce((s, e) => s + e.tokens, 0);
      assert.equal(l.snapshot(agent, now).usedTokens, expected);
    }));
  });

  it('P2: headroom stays in [0,1] and never increases as events are added at fixed now', () => {
    fc.assert(fc.property(
      eventsArb, fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 50 }), agentArb,
      (events, tokens, requests, agent) => {
        const l = new QuotaLedger({ [agent]: { tokens, requests } }, 10_000, memoryStore());
        let prev = l.snapshot(agent, 1000).headroom;
        for (const e of events) {
          l.record({ ...e, agent, ok: true, estimated: false }, 1000);
          const h = l.snapshot(agent, 1000).headroom;
          assert.ok(h >= 0 && h <= 1);
          assert.ok(h <= prev + 1e-12);
          prev = h;
        }
      },
    ));
  });

  it('P3: exhausted iff some limited dimension is used up', () => {
    fc.assert(fc.property(eventsArb, fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 20 }), (events, tokens, requests) => {
      const l = new QuotaLedger({ claude: { tokens, requests } }, 10_000, memoryStore());
      for (const e of events) l.record({ ...e, agent: 'claude', ok: true, estimated: false }, 1000);
      const s = l.snapshot('claude', 1000);
      assert.equal(s.exhausted, s.usedTokens >= tokens || s.usedRequests >= requests);
    }));
  });
});
