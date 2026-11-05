import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { chooseAgent } from '../src/router.ts';
import type { RouteContext } from '../src/router.ts';
import type { QuotaSnapshot } from '../src/quota/ledger.ts';
import { AGENT_IDS } from '../src/types.ts';
import type { AgentId } from '../src/types.ts';

function snap(agent: AgentId, headroom: number, exhausted = false): QuotaSnapshot {
  return { agent, usedTokens: 0, usedRequests: 0, tokenLimit: null, requestLimit: null, headroom, exhausted, resetsAt: exhausted ? 120_000 : null };
}

function ctx(opts: Partial<Record<AgentId, { enabled?: boolean; available?: boolean; headroom?: number; exhausted?: boolean }>>): RouteContext {
  return {
    isEnabled: (a) => opts[a]?.enabled ?? true,
    isAvailable: (a) => opts[a]?.available ?? true,
    snapshot: (a) => snap(a, opts[a]?.headroom ?? 1, opts[a]?.exhausted ?? false),
  };
}

describe('chooseAgent', () => {
  it('returns an explicit agent even if its binary is missing', () => {
    const d = chooseAgent({ requested: 'gemini' }, ctx({ gemini: { available: false } }), 0);
    assert.deepEqual(d, { ok: true, agent: 'gemini', routedBy: 'explicit' });
  });

  it('refuses an explicit disabled agent (Req 4.4)', () => {
    const d = chooseAgent({ requested: 'codex' }, ctx({ codex: { enabled: false } }), 0);
    assert.equal(d.ok, false);
  });

  it('refuses an explicit exhausted agent and says when it resets (Req 3.5)', () => {
    const d = chooseAgent({ requested: 'claude' }, ctx({ claude: { exhausted: true, headroom: 0 } }), 0);
    assert.equal(d.ok, false);
    assert.match(!d.ok ? d.reason : '', /~2 min/);
  });

  it('auto picks the most headroom (Req 4.1)', () => {
    const d = chooseAgent({ requested: 'auto' }, ctx({ codex: { headroom: 0.2 }, claude: { headroom: 0.9 }, gemini: { headroom: 0.5 }, opencode: { available: false } }), 0);
    assert.deepEqual(d, { ok: true, agent: 'claude', routedBy: 'auto' });
  });

  it('auto honours skill preferences and their order as tiebreak (Req 4.2)', () => {
    const d = chooseAgent({ requested: 'auto', preferred: ['opencode', 'gemini'] }, ctx({ claude: { headroom: 1 } }), 0);
    assert.deepEqual(d, { ok: true, agent: 'opencode', routedBy: 'auto' });
  });

  it('auto explains every skip when nothing is eligible (Req 4.3)', () => {
    const d = chooseAgent({ requested: 'auto' }, ctx({
      codex: { enabled: false }, claude: { available: false }, gemini: { exhausted: true }, opencode: { exhausted: true },
    }), 0);
    assert.equal(d.ok, false);
    const reason = !d.ok ? d.reason : '';
    for (const id of AGENT_IDS) assert.ok(reason.includes(id), id);
  });

  it('P4: never chooses an exhausted, disabled or unavailable agent in auto mode (Req 4.5)', () => {
    const stateArb = fc.record({ enabled: fc.boolean(), available: fc.boolean(), exhausted: fc.boolean(), headroom: fc.double({ min: 0, max: 1, noNaN: true }) });
    fc.assert(fc.property(
      fc.record({ codex: stateArb, claude: stateArb, gemini: stateArb, opencode: stateArb }),
      fc.subarray([...AGENT_IDS]),
      (states, preferred) => {
        const d = chooseAgent({ requested: 'auto', preferred }, ctx(states), 0);
        if (d.ok) {
          const s = states[d.agent];
          assert.ok(s.enabled && s.available && !s.exhausted);
          if (preferred.length) assert.ok(preferred.includes(d.agent));
        }
      },
    ));
  });
});
