import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.ts';
import { runDemo } from '../src/demo.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { fakeSpawn } from './helpers.ts';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (s: string) => void out.push(s), stderr: (s: string) => void err.push(s) }, out, err };
}

describe('stitchwork doctor (Req 11)', () => {
  it('reports install state, version and limits, and exits 0', async () => {
    const c = capture();
    const spawn = fakeSpawn((call) => ({ stdout: `${call.command} 1.2.3\nextra line` }));
    const code = await main(['doctor'], c.io, { which: (b) => b === 'claude' || b === 'codex', spawn: spawn.fn, store: memoryStore() });
    const text = c.out.join('');
    assert.equal(code, 0);
    assert.match(text, /✔ claude\s+claude\s+claude 1\.2\.3/);
    assert.match(text, /✘ gemini\s+gemini \(not on PATH\)/);
    assert.match(text, /2 of 4 agents ready\./);
    assert.match(text, /"mcpServers"/);
    assert.ok(!text.includes('extra line'));
    assert.deepEqual(spawn.calls.map((x) => x.args), [['--version'], ['--version']]);
  });

  it('exits 0 with a hint when nothing is installed (Req 11.3)', async () => {
    const c = capture();
    const code = await main(['doctor'], c.io, { which: () => false, store: memoryStore() });
    assert.equal(code, 0);
    assert.match(c.out.join(''), /0 of 4 agents ready\. Install at least one CLI/);
  });
});

describe('stitchwork demo (Req 12)', () => {
  it('runs the scripted scenario end to end with the bundled stand-in agents', async () => {
    const out: string[] = [];
    const code = await runDemo({ out: (s) => void out.push(s), color: false, paceMs: 0 });
    const text = out.join('');
    assert.equal(code, 0);
    const order = [
      'The limbs', '[claude] Refactor', '[claude] Write unit tests', 'Refused: Agent "claude" has no quota left',
      '[codex] Now add rate limiting', 'Gemini CLI is rate-limited', 'fell back from gemini (rate-limited)',
      'Next request skips Gemini', 'cooling until', "It's alive.",
    ];
    let at = -1;
    for (const marker of order) {
      const i = text.indexOf(marker, at + 1);
      assert.ok(i > at, `expected "${marker}" after position ${at}`);
      at = i;
    }
    assert.ok(!/\x1b\[/.test(text), 'no ANSI codes when color is off');
  });

  it('pauses between steps when --pace is set (Req 12.4)', async () => {
    const pauses: number[] = [];
    await runDemo({ out: () => {}, color: true, paceMs: 40, sleep: async (ms) => void pauses.push(ms) });
    assert.ok(pauses.length >= 7);
    assert.ok(pauses.every((p) => p === 40));
  });

  it('rejects a bad --pace', async () => {
    const c = capture();
    assert.equal(await main(['demo', '--pace', 'soon'], c.io), 2);
  });
});
