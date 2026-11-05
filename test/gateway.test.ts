import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { SkillRegistry } from '../src/skills/registry.ts';
import { fakeSpawn } from './helpers.ts';

const claudeJson = (result: string, input = 40, output = 10) =>
  JSON.stringify({ type: 'result', result, usage: { input_tokens: input, output_tokens: output } });

function make(opts: { config?: unknown; spawn?: ReturnType<typeof fakeSpawn>; available?: string[] } = {}) {
  const store = memoryStore();
  const skills = new SkillRegistry();
  skills.add('review.md', '---\nname: review\ndescription: r\nagents: [codex, claude]\n---\nReview: {{input}}');
  const spawn = opts.spawn ?? fakeSpawn({ stdout: claudeJson('hi') });
  const logs: string[] = [];
  let t = 1_000_000;
  const gw = new Gateway(mergeConfig(opts.config ?? {}, '/tmp'), {
    spawn: spawn.fn, store, skills, now: () => (t += 1000),
    which: (b) => (opts.available ?? ['claude', 'codex', 'gemini', 'opencode']).includes(b),
    env: { ANTHROPIC_API_KEY: 'sk-test-should-not-leak' }, log: (m) => logs.push(m),
  });
  return { gw, store, spawn, logs };
}

describe('Gateway.run', () => {
  it('runs an explicit agent and records usage in the ledger (Req 1.2, 3.1)', async () => {
    const { gw, store, spawn } = make();
    const r = await gw.run({ agent: 'claude', prompt: 'hello' });
    assert.equal(r.ok, true);
    if (!r.refused) {
      assert.equal(r.output, 'hi');
      assert.equal(r.usage.totalTokens, 50);
      assert.equal(r.routedBy, 'explicit');
    }
    assert.equal(spawn.calls[0]?.command, 'claude');
    assert.equal(store.lines.length, 1);
    assert.equal(gw.quota().find((q) => q.agent === 'claude')?.usedTokens, 50);
  });

  it('never writes env values or prompts to the ledger (Req 3.8, 6.4)', async () => {
    const { gw, store } = make();
    await gw.run({ agent: 'claude', prompt: 'my secret prompt' });
    const raw = store.lines.join('\n');
    assert.ok(!raw.includes('sk-test-should-not-leak'));
    assert.ok(!raw.includes('secret prompt'));
  });

  it('renders a skill and routes within its preferred agents (Req 5.3, 4.2)', async () => {
    const { gw, spawn } = make({ available: ['claude', 'gemini'] });
    const r = await gw.run({ skill: 'review', input: 'diff --git a b' });
    assert.equal(r.ok, true);
    assert.equal(spawn.calls[0]?.command, 'claude');
    assert.ok(spawn.calls[0]?.args.includes('Review: diff --git a b'));
  });

  it('auto-routes away from an exhausted agent', async () => {
    const { gw, spawn } = make({ config: { agents: { claude: { limits: { requests: 1 } } } }, available: ['claude', 'gemini'] });
    await gw.run({ agent: 'claude', prompt: 'one' });
    const r = await gw.run({ agent: 'auto', prompt: 'two' });
    assert.ok(!r.refused && r.agent === 'gemini');
    assert.equal(spawn.calls[1]?.command, 'gemini');
  });

  it('refuses explicit runs on an exhausted agent (Req 3.5)', async () => {
    const { gw } = make({ config: { agents: { claude: { limits: { tokens: 10 } } } } });
    await gw.run({ agent: 'claude', prompt: 'x' });
    const r = await gw.run({ agent: 'claude', prompt: 'y' });
    assert.ok(r.refused);
    if (r.refused) assert.match(r.reason, /no quota left/);
  });

  it('returns stderr tail on non-zero exit (Req 1.5)', async () => {
    const { gw } = make({ spawn: fakeSpawn({ stderr: 'auth expired', exitCode: 1 }) });
    const r = await gw.run({ agent: 'codex', prompt: 'x' });
    assert.ok(!r.refused && !r.ok && r.output === 'auth expired' && r.exitCode === 1);
  });

  it('reports a missing binary and does not charge the ledger (Req 1.7)', async () => {
    const { gw, store } = make({ spawn: fakeSpawn({ missing: true }) });
    const r = await gw.run({ agent: 'opencode', prompt: 'x' });
    assert.ok(!r.refused && !r.ok);
    if (!r.refused) assert.match(r.output, /not found on PATH/);
    assert.equal(store.lines.length, 0);
    assert.equal(gw.isAvailable('opencode'), false);
  });

  it('uses a configured binary and extraArgs (Req 1.8)', async () => {
    const { gw, spawn } = make({ config: { agents: { gemini: { binary: '/opt/gemini', extraArgs: ['-m', 'flash'] } } }, available: ['/opt/gemini'] });
    await gw.run({ agent: 'gemini', prompt: 'x' });
    assert.equal(spawn.calls[0]?.command, '/opt/gemini');
    assert.deepEqual(spawn.calls[0]?.args.slice(-2), ['-m', 'flash']);
  });

  it('refuses empty prompts and unknown skills', async () => {
    const { gw } = make();
    assert.ok((await gw.run({ prompt: '  ' })).refused);
    assert.ok((await gw.run({ skill: 'nope' })).refused);
  });

  it('lists agents with availability and quota', () => {
    const { gw } = make({ available: ['codex'] });
    const info = gw.agents();
    assert.equal(info.length, 4);
    assert.equal(info.find((a) => a.id === 'codex')?.available, true);
    assert.equal(info.find((a) => a.id === 'claude')?.available, false);
  });
});
