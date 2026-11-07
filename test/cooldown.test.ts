import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { QuotaLedger, memoryStore, parseEvent } from '../src/quota/ledger.ts';
import { AGENT_IDS } from '../src/types.ts';

const MIN = 60_000;

describe('Ledger cooldown (Req 8.1, 8.2, 8.7)', () => {
  it('reports coolingUntil after a rate-limited event and clears it after the cooldown', () => {
    const l = new QuotaLedger({}, 60 * MIN, memoryStore(), 15 * MIN);
    l.record({ ts: 10 * MIN, agent: 'gemini', tokens: 0, ok: false, estimated: true, rateLimited: true }, 10 * MIN);
    assert.equal(l.snapshot('gemini', 11 * MIN).coolingUntil, 25 * MIN);
    assert.equal(l.snapshot('gemini', 25 * MIN).coolingUntil, null);
    assert.equal(l.snapshot('claude', 11 * MIN).coolingUntil, null);
  });

  it('keeps a cooldown even when it outlives the usage window', () => {
    const l = new QuotaLedger({}, 5 * MIN, memoryStore(), 30 * MIN);
    l.record({ ts: 0, agent: 'codex', tokens: 1, ok: false, estimated: false, rateLimited: true }, 0);
    l.record({ ts: 10 * MIN, agent: 'claude', tokens: 1, ok: true, estimated: false }, 10 * MIN);
    const s = l.snapshot('codex', 20 * MIN);
    assert.equal(s.usedRequests, 0);
    assert.equal(s.coolingUntil, 30 * MIN);
  });

  it('persists the flag only when true and survives a reload from the store', () => {
    const store = memoryStore();
    const a = new QuotaLedger({}, 60 * MIN, store);
    a.record({ ts: 1, agent: 'claude', tokens: 5, ok: true, estimated: false }, 1);
    a.record({ ts: 2, agent: 'claude', tokens: 0, ok: false, estimated: true, rateLimited: true }, 2);
    assert.ok(!store.lines[0]?.includes('rateLimited'));
    assert.ok(store.lines[1]?.includes('"rateLimited":true'));
    const b = new QuotaLedger({}, 60 * MIN, store);
    assert.notEqual(b.snapshot('claude', 3).coolingUntil, null);
    assert.equal(parseEvent(store.lines[0] ?? '')?.rateLimited, undefined);
  });

  it('P5: coolingUntil is the max end of any cooldown covering now', () => {
    const agentArb = fc.constantFrom(...AGENT_IDS);
    const evArb = fc.record({ ts: fc.integer({ min: 0, max: 1000 }), agent: agentArb, rl: fc.boolean() });
    fc.assert(fc.property(fc.array(evArb, { maxLength: 30 }), fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 400 }),
      fc.integer({ min: 0, max: 1500 }), agentArb, (events, windowMs, cooldownMs, now, agent) => {
        const store = memoryStore(events.map((e) => JSON.stringify({ ts: e.ts, agent: e.agent, tokens: 1, ok: !e.rl, estimated: false, ...(e.rl ? { rateLimited: true } : {}) })));
        const l = new QuotaLedger({}, windowMs, store, cooldownMs);
        const covering = events.filter((e) => e.rl && e.agent === agent && e.ts <= now && now < e.ts + cooldownMs);
        const expected = covering.length ? Math.max(...covering.map((e) => e.ts + cooldownMs)) : null;
        assert.equal(l.snapshot(agent, now).coolingUntil, expected);
      }));
  });
});

