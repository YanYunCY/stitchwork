import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { gaugeFill } from '../src/lab/gauge.ts';
import { renderPage } from '../src/lab/page.ts';
import { PAGE_JS } from '../src/lab/page-js.ts';
import type { FakeEl } from './fake-dom.ts';
import { runPage } from './fake-dom.ts';

const IDS = ['conn', 'limbs', 'tray-body', 'launcher', 'skill', 'skill-desc', 'agent', 'input', 'run', 'cancel', 'launch-status', 'output'];
const NOW = 1_700_000_000_000;
const snap = (o: Record<string, unknown>) => ({ usedTokens: 0, usedRequests: 0, tokenLimit: null, requestLimit: null, headroom: 1, exhausted: false, resetsAt: null, coolingUntil: null, ...o });
const STATE = {
  now: NOW, readOnly: false,
  agents: [
    { id: 'codex', name: 'Codex CLI', enabled: true, available: true, quota: snap({ usedTokens: 100, tokenLimit: 100, headroom: 0, exhausted: true, resetsAt: NOW + 60_000 }) },
    { id: 'claude', name: 'Claude Code', enabled: true, available: true, quota: snap({ coolingUntil: NOW + 90_000 }) },
    { id: 'gemini', name: 'Gemini CLI', enabled: false, available: true, quota: snap({}) },
    { id: 'opencode', name: 'OpenCode', enabled: true, available: false, quota: snap({ usedRequests: 8, requestLimit: 10, headroom: 0.2 }) },
  ],
};
const RUNS = { runs: [
  { ts: NOW, agent: 'claude', ok: true, tokens: 12, estimated: true, durationMs: 1500, fallbacks: 1 },
  { ts: NOW - 5, agent: 'codex', ok: false, tokens: 0, estimated: false, rateLimited: true },
] };

const text = (e: FakeEl) => e.textContent;

describe('lab page markup (Req 15.6, 19.3)', () => {
  const html = renderPage(false);
  const script = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? '';

  it('loads nothing remote', () => {
    assert.doesNotMatch(html, /https?:\/\//i);
    assert.doesNotMatch(html, /<(link|img|iframe|object|embed)\b/i);
    assert.doesNotMatch(html, /\bsrc\s*=/i);
    assert.doesNotMatch(html, /@import|url\(/i);
    assert.equal((html.match(/<script/g) ?? []).length, 1);
  });

  it('carries inline JS that parses', () => {
    assert.ok(script.length > 500);
    assert.doesNotThrow(() => new Function(script));
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(script));
  });

  it('hides the launcher in read-only mode', () => {
    assert.ok(html.includes('id="launcher"'));
    const ro = renderPage(true);
    assert.ok(!ro.includes('id="launcher"'));
    assert.ok(!ro.includes('id="run"'));
    assert.match(ro, /Read-only mode/);
    assert.doesNotThrow(() => new Function(/<script>([\s\S]*)<\/script>/.exec(ro)?.[1] ?? ''));
  });

  it('names its controls', () => {
    for (const id of ['skill', 'agent', 'input']) assert.match(html, new RegExp(`<label for="${id}"`));
  });

  it('the inline gaugeFill equals the server one', () => {
    const src = /function gaugeFill[\s\S]*?\n}/.exec(PAGE_JS)?.[0] as string;
    const inline = new Function(`${src}; return gaugeFill;`)() as typeof gaugeFill;
    fc.assert(fc.property(fc.double({ min: 0, max: 1e6, noNaN: true }), fc.oneof(fc.constant(null), fc.double({ min: -5, max: 1e6, noNaN: true })), (u, l) => {
      assert.equal(inline(u, l), gaugeFill(u, l));
    }), { numRuns: 300 });
  });
});

describe('lab page behaviour in a fake DOM (Req 16.2-16.6, 17.4, 18.2-18.6)', () => {
  const route = (state: unknown = STATE) => (path: string, _init?: unknown) => {
    if (path === '/api/state') return { status: 200, body: state };
    if (path === '/api/runs') return { status: 200, body: RUNS };
    if (path === '/api/skills') return { status: 200, body: { skills: [{ name: 'explain', description: 'Explain code', agents: ['gemini'] }, { name: 'review', description: 'Review', agents: [] }] } };
    if (path === '/api/launch/status') return { status: 200, body: { running: true, agent: 'claude' } };
    return { status: 404, body: { error: 'x' } };
  };
  const realNow = Date.now;
  const withClock = async (fn: () => Promise<void>) => { Date.now = () => NOW; try { await fn(); } finally { Date.now = realNow; } };

  it('draws one limb per agent with gauges, badges and dimming', async () => withClock(async () => {
    const h = runPage(PAGE_JS, IDS, route());
    await h.flush();
    const limbs = h.ids.limbs?.find((e) => e.tag === 'article') as FakeEl[];
    assert.equal(limbs.length, 4);
    const [codex, claude, gemini, opencode] = limbs as [FakeEl, FakeEl, FakeEl, FakeEl];
    assert.match(text(codex), /exhausted/);
    assert.match(codex.className, /exhausted/);
    assert.match(text(codex), /100 \/ 100 · 0% left/);
    assert.match(text(codex), /requests.*unlimited/);
    const red = codex.find((e) => e.className.includes('fill'))[0] as FakeEl;
    assert.match(red.className, /red/);
    assert.match(red.className, /none/);
    assert.match(text(claude), /stitches healing · 1:30/);
    assert.match(claude.className, /cooling/);
    assert.match(text(claude), /tokens.*unlimited/);
    const noFill = claude.find((e) => e.className.includes('fill'))[0] as FakeEl;
    assert.match(noFill.className, /none/);
    assert.match(gemini.className, /dim/);
    assert.match(text(gemini), /disabled in config/);
    assert.match(opencode.className, /dim/);
    assert.match(text(opencode), /not installed/);
    assert.match(text(opencode), /8 \/ 10 · 20% left/);
    const amber = opencode.find((e) => e.className.includes('fill'))[1] as FakeEl;
    assert.match(amber.className, /amber/);
    assert.equal(amber.style.width, '20%');
    assert.match(text(codex), /headroom 0%/);
    assert.match(text(codex), /resets /);
    const meter = codex.find((e) => e.attrs.role === 'meter')[0] as FakeEl;
    assert.equal(meter.attrs['aria-valuenow'], '0');
  }));

  it('counts cooldowns down between polls', async () => withClock(async () => {
    const h = runPage(PAGE_JS, IDS, route());
    await h.flush();
    Date.now = () => NOW + 31_000;
    h.intervals.forEach((f) => f());
    assert.match(text(h.ids.limbs as FakeEl), /stitches healing · 0:59/);
  }));

  it('lists the tray with estimate, duration and failover markers (Req 17.4)', async () => withClock(async () => {
    const h = runPage(PAGE_JS, IDS, route());
    await h.flush();
    const rows = (h.ids['tray-body'] as FakeEl).find((e) => e.tag === 'tr');
    assert.equal(rows.length, 2);
    assert.match(text(rows[0] as FakeEl), /claude✓ ok~121\.5s🧵 failover x1/);
    assert.match(text(rows[1] as FakeEl), /codex✗ failed0—🧵 rate-limited/);
  }));

  it('shows "disconnected" after three failed refreshes and recovers (Req 16.5)', async () => withClock(async () => {
    let down = true;
    const h = runPage(PAGE_JS, IDS, (p, i) => (down && p !== '/api/skills' ? { status: 500, body: {} } : route()(p, i)));
    await h.flush();
    assert.equal(h.ids.conn?.className, '', 'two failures so far');
    await h.flush();
    assert.equal(h.ids.conn?.className, 'on');
    assert.match(text(h.ids.conn as FakeEl), /Disconnected/);
    down = false;
    await h.flush();
    assert.equal(h.ids.conn?.className, '');
  }));

  it('polls every 2 seconds with chained timeouts, not an interval', async () => withClock(async () => {
    const h = runPage(PAGE_JS, IDS, route());
    await h.flush();
    const before = h.fetchLog.filter((f) => f.path === '/api/state').length;
    await h.flush();
    assert.equal(h.fetchLog.filter((f) => f.path === '/api/state').length, before + 1);
    assert.equal(h.intervals.length, 1, 'only the countdown ticker is an interval');
  }));

  it('runs nothing until Run is clicked, then posts exactly skill, input, agent (Req 18.2, 18.3)', async () => withClock(async () => {
    const h = runPage(PAGE_JS, IDS, (p, i) => (p === '/api/launch'
      ? { status: 200, body: { ok: true, agent: 'gemini', output: '<img src=x onerror=alert(1)>', tokens: 7, estimated: true, durationMs: 2000, fallbacks: [{ agent: 'codex', reason: 'rate-limited' }] } }
      : route()(p, i)));
    await h.flush();
    assert.equal(h.fetchLog.filter((f) => f.method === 'POST').length, 0);
    assert.equal(text(h.ids.skill as FakeEl), 'explainreview');
    (h.ids.skill as FakeEl).value = 'review';
    (h.ids.agent as FakeEl).value = 'auto';
    (h.ids.input as FakeEl).value = 'my input';
    (h.ids.run as FakeEl).click();
    assert.equal(h.ids.run?.disabled, true, 'Run is disabled while in flight (Req 18.4)');
    assert.equal(h.ids.cancel?.disabled, false);
    await h.flush();
    assert.deepEqual(h.fetchLog.filter((f) => f.method === 'POST'), [{ path: '/api/launch', method: 'POST', body: { skill: 'review', input: 'my input', agent: 'auto' } }]);
    assert.equal(text(h.ids.output as FakeEl), '<img src=x onerror=alert(1)>');
    assert.equal((h.ids.output as FakeEl).all().length, 0, 'output is text, never markup');
    assert.match(text(h.ids['launch-status'] as FakeEl), /Finished on gemini · ~7 tokens · 2\.0s · fell back from codex/);
    assert.equal(h.ids.run?.disabled, false);
    assert.equal(h.ids.cancel?.disabled, true);
  }));

  it('shows the routed agent while running and the refusal reason after (Req 18.4, 18.5)', async () => withClock(async () => {
    const h = runPage(PAGE_JS, IDS, (p, i) => (p === '/api/launch' ? { status: 200, body: { ok: false, refused: true, reason: 'No agent available.', fallbacks: [] } } : route()(p, i)));
    await h.flush();
    (h.ids.run as FakeEl).click();
    h.intervals[h.intervals.length - 1]?.();
    await h.flush();
    assert.match(text(h.ids['launch-status'] as FakeEl), /Refused: No agent available\./);
    assert.equal((h.ids.output as FakeEl).textContent, '');
  }));

  it('Cancel posts to the cancel endpoint (Req 18.6)', async () => withClock(async () => {
    const h = runPage(PAGE_JS, IDS, route());
    await h.flush();
    (h.ids.cancel as FakeEl).click();
    assert.ok(h.fetchLog.some((f) => f.path === '/api/launch/cancel' && f.method === 'POST'));
  }));
});
