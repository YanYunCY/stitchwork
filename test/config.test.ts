import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadConfig, mergeConfig } from '../src/config.ts';

const base = '/tmp/base';

describe('config', () => {
  it('has safe defaults when no file exists (Req 6.1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-cfg-'));
    const c = loadConfig(undefined, dir);
    assert.equal(c.windowMinutes, 300);
    assert.equal(c.ledgerPath, join(dir, '.stitchwork', 'ledger.jsonl'));
    assert.equal(c.skillsDir, join(dir, 'skills'));
    for (const a of Object.values(c.agents)) assert.deepEqual(a, { enabled: true, extraArgs: [], limits: {} });
  });

  it('merges overrides', () => {
    const c = mergeConfig({ windowMinutes: 60, agents: { claude: { limits: { tokens: 10 }, extraArgs: ['--x'] }, opencode: { enabled: false } } }, base);
    assert.equal(c.windowMinutes, 60);
    assert.deepEqual(c.agents.claude.limits, { tokens: 10 });
    assert.deepEqual(c.agents.claude.extraArgs, ['--x']);
    assert.equal(c.agents.opencode.enabled, false);
    assert.equal(c.agents.codex.enabled, true);
  });

  it('names the offending field (Req 6.2)', () => {
    const cases: [unknown, RegExp][] = [
      [{ windowMinutes: -1 }, /windowMinutes/],
      [{ agents: { cursor: {} } }, /agents\.cursor/],
      [{ agents: { codex: { enabled: 'yes' } } }, /agents\.codex\.enabled/],
      [{ agents: { claude: { limits: { tokens: '5' } } } }, /agents\.claude\.limits\.tokens/],
      [{ agents: { gemini: { extraArgs: [1] } } }, /agents\.gemini\.extraArgs/],
      [[], /root/],
    ];
    for (const [raw, re] of cases) assert.throws(() => mergeConfig(raw, base), (e: unknown) => e instanceof ConfigError && re.test(e.message));
  });

  it('rejects invalid JSON with the file name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-cfg-'));
    writeFileSync(join(dir, 'stitchwork.config.json'), '{ nope');
    assert.throws(() => loadConfig(undefined, dir), /not valid JSON/);
  });

  it('accepts the shipped example config', () => {
    const raw = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'stitchwork.config.example.json'), 'utf8'));
    const c = mergeConfig(raw, base);
    assert.equal(c.agents.opencode.enabled, false);
  });
});

describe('M2 config fields (Req 8.2, 8.3)', () => {
  it('defaults cooldownMinutes to 15 and maxFallbacks to 2', () => {
    const c = mergeConfig({}, '/tmp');
    assert.equal(c.cooldownMinutes, 15);
    assert.equal(c.maxFallbacks, 2);
  });
  it('rejects a bad maxFallbacks with its field path', () => {
    assert.throws(() => mergeConfig({ maxFallbacks: 7 }, '/tmp'), /maxFallbacks must be an integer from 0 to 3/);
    assert.throws(() => mergeConfig({ cooldownMinutes: 0 }, '/tmp'), /cooldownMinutes must be a positive number/);
  });
});

describe('binary paths', () => {
  it('resolves a path against the base dir and leaves a bare name for PATH lookup', () => {
    const c = mergeConfig({ agents: { claude: { binary: 'tools/claude' }, codex: { binary: 'codex' }, gemini: { binary: '/opt/gemini' } } }, base);
    assert.equal(c.agents.claude.binary, join(base, 'tools', 'claude'));
    assert.equal(c.agents.codex.binary, 'codex');
    assert.equal(c.agents.gemini.binary, '/opt/gemini');
  });
});
