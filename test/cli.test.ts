import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseArgs } from '../src/cli.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { fakeSpawn } from './helpers.ts';

const root = join(import.meta.dirname, '..');

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (s: string) => void out.push(s), stderr: (s: string) => void err.push(s) }, out, err };
}

describe('parseArgs', () => {
  it('splits command, flags and prompt words', () => {
    assert.deepEqual(parseArgs(['run', '--agent', 'claude', 'fix', 'bug', '--cwd=/x']), {
      command: 'run', flags: { agent: 'claude', cwd: '/x' }, rest: ['fix', 'bug'],
    });
  });
});

describe('cli main', () => {
  it('prints usage and exits 2 for an unknown command (Req 7.4)', async () => {
    const c = capture();
    assert.equal(await main(['dance'], c.io), 2);
    assert.match(c.err.join(''), /Unknown command: dance/);
  });

  it('--help exits 0', async () => {
    const c = capture();
    assert.equal(await main(['--help'], c.io), 0);
    assert.match(c.out.join(''), /stitchwork serve/);
  });

  it('runs a prompt through the gateway (Req 7.3)', async () => {
    const c = capture();
    const spawn = fakeSpawn({ stdout: 'patched it\ntokens used: 99' });
    const code = await main(['run', '--agent', 'codex', 'fix', 'the', 'bug'], c.io, { spawn: spawn.fn, store: memoryStore(), which: () => true });
    assert.equal(code, 0);
    assert.equal(c.out.join(''), 'patched it\n');
    assert.match(c.err.join(''), /codex \(explicit\) · 99 tokens/);
    assert.equal(spawn.calls[0]?.args.at(-1), 'fix the bug');
  });

  it('rejects a bad --agent', async () => {
    const c = capture();
    assert.equal(await main(['run', '--agent', 'cursor', 'x'], c.io, { store: memoryStore() }), 2);
  });

  it('prints quota as a table (Req 7.2)', async () => {
    const c = capture();
    assert.equal(await main(['quota'], c.io, { store: memoryStore(), which: () => false }), 0);
    assert.match(c.out.join(''), /codex\s+tokens 0/);
  });

  it('reports config errors with the field name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-cli-'));
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify({ windowMinutes: 'soon' }));
    const c = capture();
    assert.equal(await main(['agents', '--config', file], c.io), 1);
    assert.match(c.err.join(''), /windowMinutes/);
  });
});

describe('real process smoke test', () => {
  it('`node src/cli.ts serve` answers initialize over real stdio (Req 7.1)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-serve-'));
    const input = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n';
    const r = spawnSync(process.execPath, [join(root, 'src', 'cli.ts'), 'serve'], { cwd: dir, input, encoding: 'utf8', timeout: 10_000 });
    const lines = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines[0].result.serverInfo.name, 'stitchwork');
    assert.equal(lines[1].result.tools.length, 5);
    assert.match(r.stderr, /MCP server ready/);
  });

  it('bin launcher prints help', () => {
    const out = execFileSync(process.execPath, [join(root, 'bin', 'stitchwork.js'), '--help'], { encoding: 'utf8' });
    assert.match(out, /one MCP gateway/);
  });
});
