import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import * as api from '../src/lab/api.ts';
import type { LabSkill, LabState } from '../src/lab/api.ts';
import type { RunRow } from '../src/lab/runs.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { SkillRegistry } from '../src/skills/registry.ts';

const skills = new SkillRegistry();
skills.add('a.md', '---\nname: explain\ndescription: Explain code\nagents: [gemini]\n---\nExplain {{input}}');

function gw(lines: string[] = [], throwing = false) {
  const store = memoryStore(lines);
  if (throwing) store.load = () => { throw new Error('EACCES'); };
  const g = new Gateway(mergeConfig({ windowMinutes: 1, agents: { claude: { limits: { requests: 4 } }, gemini: { enabled: false } } }, '/tmp'), {
    store: throwing ? memoryStore() : store, skills, which: (b) => b !== 'opencode', env: {}, log: () => {}, now: () => 1_000_000,
  });
  if (throwing) Object.defineProperty(g, 'store', { value: store });
  return g;
}

describe('lab api handlers (Req 16.1, 17.1, 17.3, 18.1)', () => {
  it('state lists every agent with quota, install state and server time', () => {
    const r = api.state(gw(['{"ts":999000,"agent":"claude","tokens":10}']), false, 1_234);
    const b = r.body as LabState;
    assert.equal(r.status, 200);
    assert.equal(b.now, 1_234);
    assert.deepEqual(b.agents.map((a) => a.id), ['codex', 'claude', 'gemini', 'opencode']);
    const claude = b.agents.find((a) => a.id === 'claude');
    assert.equal(claude?.quota.usedRequests, 1);
    assert.equal(claude?.quota.requestLimit, 4);
    assert.equal(claude?.quota.headroom, 0.75);
    assert.equal(b.agents.find((a) => a.id === 'gemini')?.enabled, false);
    assert.equal(b.agents.find((a) => a.id === 'opencode')?.available, false);
    assert.ok(!('binary' in (b.agents[0] as object)));
  });

  it('runs reads old events from the ledger, newest first, capped at 20', () => {
    const lines = Array.from({ length: 30 }, (_, i) => JSON.stringify({ ts: i + 1, agent: 'codex', tokens: i }));
    const rows = (api.runs(gw(lines)).body as { runs: RunRow[] }).runs;
    assert.equal(rows.length, 20);
    assert.equal(rows[0]?.ts, 30);
    assert.equal(rows[19]?.ts, 11);
  });

  it('runs yields an empty list when the ledger is unreadable', () => {
    assert.deepEqual(api.runs(gw([], true)).body, { runs: [] });
  });

  it('skills returns name, description and preferred agents only', () => {
    const list = (api.skills(gw()).body as { skills: LabSkill[] }).skills;
    assert.deepEqual(list, [{ name: 'explain', description: 'Explain code', agents: ['gemini'] }]);
  });
});
