import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { mergeConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import type { ProgressEvent } from '../src/gateway.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { SkillRegistry } from '../src/skills/registry.ts';
import { AGENT_IDS } from '../src/types.ts';
import type { AgentId } from '../src/types.ts';
import { fakeSpawn } from './helpers.ts';
import type { FakeBehaviour } from './helpers.ts';

const ok = (agent: string): FakeBehaviour => ({ stdout: `answer from ${agent}\ntokens used: 10\n`, exitCode: 0 });
const limited: FakeBehaviour = { stderr: 'Error: 429 Too Many Requests', exitCode: 1 };

function make(behaviour: (binary: string) => FakeBehaviour, config: Record<string, unknown> = {}) {
  const store = memoryStore();
  const spawn = fakeSpawn((call) => behaviour(call.command));
  let t = 5_000_000;
  const gw = new Gateway(mergeConfig(config, '/tmp'), {
    spawn: spawn.fn, store, skills: new SkillRegistry(), now: () => (t += 1000),
    which: () => true, env: {}, log: () => {},
  });
  return { gw, store, spawn };
}

describe('Gateway rate-limit failover (Req 8)', () => {
  it('falls back from a rate-limited agent and lists the fallback', async () => {
    const { gw, spawn, store } = make((b) => (b === 'codex' ? limited : ok(b)));
    const r = await gw.run({ agent: 'auto', prompt: 'fix the bug' });
    assert.equal(r.ok, true);
    assert.ok(!r.refused);
    if (!r.refused) {
      assert.deepEqual(r.fallbacks, [{ agent: 'codex', reason: 'rate-limited' }]);
      assert.equal(r.agent, 'claude');
    }
    assert.deepEqual(spawn.calls.map((c) => c.command), ['codex', 'claude']);
    assert.ok(store.lines[0]?.includes('"rateLimited":true'));
  });

  it('skips the cooling agent on the next request (Req 8.2, 8.7)', async () => {
    const { gw, spawn } = make((b) => (b === 'codex' ? limited : ok(b)));
    await gw.run({ prompt: 'one' });
    await gw.run({ prompt: 'two' });
    assert.deepEqual(spawn.calls.map((c) => c.command), ['codex', 'claude', 'claude']);
    assert.notEqual(gw.quota().find((q) => q.agent === 'codex')?.coolingUntil, null);
  });

  it('never falls back for an explicit run (Req 8.5)', async () => {
    const { gw, spawn } = make((b) => (b === 'codex' ? limited : ok(b)));
    const r = await gw.run({ agent: 'codex', prompt: 'x' });
    assert.equal(r.ok, false);
    if (!r.refused) {
      assert.equal(r.rateLimited, true);
      assert.deepEqual(r.fallbacks, []);
    }
    assert.equal(spawn.calls.length, 1);
  });

  it('refuses an explicit run to a cooling agent (Req 8.6)', async () => {
    const { gw } = make((b) => (b === 'codex' ? limited : ok(b)));
    await gw.run({ agent: 'codex', prompt: 'x' });
    const r = await gw.run({ agent: 'codex', prompt: 'y' });
    assert.equal(r.refused, true);
    if (r.refused) assert.match(r.reason, /cooling down/);
  });

  it('stops after maxFallbacks and returns the last failure with every fallback', async () => {
    const { gw, spawn } = make(() => limited, { maxFallbacks: 1 });
    const r = await gw.run({ prompt: 'x' });
    assert.equal(r.ok, false);
    assert.equal(spawn.calls.length, 2);
    if (!r.refused) {
      assert.deepEqual(r.fallbacks.map((f) => f.agent), ['codex']);
      assert.equal(r.agent, 'claude');
    }
  });

  it('does not fall back on an ordinary failure', async () => {
    const { gw, spawn } = make(() => ({ stderr: 'TypeError: boom', exitCode: 1 }));
    const r = await gw.run({ prompt: 'x' });
    assert.equal(r.ok, false);
    assert.equal(spawn.calls.length, 1);
  });

  it('P6: at most 1 + maxFallbacks attempts, no agent twice, fallbacks = attempts - 1', async () => {
    await fc.assert(fc.asyncProperty(
      fc.subarray([...AGENT_IDS]), fc.integer({ min: 0, max: 3 }),
      async (limitedAgents: AgentId[], maxFallbacks) => {
        const { gw, spawn } = make((b) => (limitedAgents.includes(b as AgentId) ? limited : ok(b)), { maxFallbacks });
        const r = await gw.run({ prompt: 'p' });
        const tried = spawn.calls.map((c) => c.command);
        assert.ok(tried.length <= 1 + maxFallbacks);
        assert.equal(new Set(tried).size, tried.length);
        const fallbacks = r.fallbacks ?? [];
        assert.equal(fallbacks.length, Math.max(0, tried.length - (r.refused ? 0 : 1)));
      }), { numRuns: 60 });
  });
});

describe('Gateway progress and cancellation (Req 9.2, 10.3)', () => {
  it('emits routed, output, fallback and done events', async () => {
    const { gw } = make((b) => (b === 'codex' ? limited : ok(b)));
    const events: ProgressEvent[] = [];
    await gw.run({ prompt: 'x' }, { onProgress: (e) => events.push(e) });
    assert.deepEqual(events.map((e) => `${e.kind}:${e.agent}`), ['routed:codex', 'fallback:codex', 'routed:claude', 'output:claude', 'done:claude']);
  });

  it('records a cancelled run with ok false and does not fall back', async () => {
    const { gw, store, spawn } = make(() => ({ hang: true }));
    const ac = new AbortController();
    const p = gw.run({ prompt: 'long job' }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    const r = await p;
    assert.equal(r.ok, false);
    if (!r.refused) assert.equal(r.cancelled, true);
    assert.equal(spawn.calls.length, 1);
    assert.ok(store.lines[0]?.includes('"ok":false'));
  });
});
