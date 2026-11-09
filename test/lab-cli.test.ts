import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { USAGE, main, parseArgs } from '../src/cli.ts';
import { openerFor } from '../src/lab/command.ts';
import type { LabHandle, LabOptions } from '../src/lab/server.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { call } from './lab-helpers.ts';
import { fakeSpawn } from './helpers.ts';

const root = join(import.meta.dirname, '..');

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { stdout: (s: string) => void out.push(s), stderr: (s: string) => void err.push(s) }, out, err };
}
const gwDeps = () => ({ store: memoryStore(), which: () => true, env: {}, log: () => {} });

function stubLab() {
  const seen: LabOptions[] = [];
  let closed = 0;
  const start = async (_gw: unknown, opts: LabOptions): Promise<LabHandle> => {
    seen.push(opts);
    return { url: 'http://127.0.0.1:4321/', port: 4321, close: async () => { closed++; } };
  };
  return { start, seen, closed: () => closed };
}

describe('stitchwork lab command (Req 15.1, 15.3, 15.4)', () => {
  it('is documented in USAGE and does not let boolean flags swallow --port', () => {
    assert.match(USAGE, /stitchwork lab \[--port <n>\] \[--open\] \[--read-only\]/);
    assert.doesNotMatch(USAGE, /--host/);
    assert.deepEqual(parseArgs(['lab', '--open', '--read-only', '--port', '0']).flags, { open: 'true', 'read-only': 'true', port: '0' });
  });

  it('starts on the default port, prints the URL and closes cleanly on interrupt', async () => {
    const c = capture();
    const lab = stubLab();
    const stop = new AbortController();
    const done = main(['lab'], c.io, gwDeps(), { startLab: lab.start, stop: stop.signal });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(lab.seen[0]?.port, 7777);
    assert.equal(lab.seen[0]?.readOnly, false);
    assert.match(c.out.join(''), /http:\/\/127\.0\.0\.1:4321\//);
    assert.equal(lab.closed(), 0, 'keeps running until interrupted');
    stop.abort();
    assert.equal(await done, 0);
    assert.equal(lab.closed(), 1);
  });

  it('passes --port and --read-only through', async () => {
    const c = capture();
    const lab = stubLab();
    const stop = new AbortController();
    stop.abort();
    assert.equal(await main(['lab', '--read-only', '--port', '0'], c.io, gwDeps(), { startLab: lab.start, stop: stop.signal }), 0);
    assert.deepEqual([lab.seen[0]?.port, lab.seen[0]?.readOnly], [0, true]);
    assert.match(c.out.join(''), /read-only/);
  });

  it('rejects --host and bad ports without starting a server (Req 15.4)', async () => {
    for (const argv of [['lab', '--host', '0.0.0.0'], ['lab', '--host=::'], ['lab', '--port', 'abc'], ['lab', '--port', '70000'], ['lab', '--port', '-1'], ['lab', '--port', '1.5']]) {
      const c = capture();
      const lab = stubLab();
      assert.equal(await main(argv, c.io, gwDeps(), { startLab: lab.start }), 2, argv.join(' '));
      assert.equal(lab.seen.length, 0);
      assert.ok(c.err.join('').length > 0);
    }
  });

  it('--open launches the platform opener through the injected spawn and keeps going if it fails', async () => {
    const lab = stubLab();
    const spawner = fakeSpawn({ missing: true });
    const c = capture();
    const stop = new AbortController();
    const done = main(['lab', '--open'], c.io, gwDeps(), { startLab: lab.start, spawn: spawner.fn, stop: stop.signal, platform: 'linux' });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(spawner.calls[0]?.command, 'xdg-open');
    assert.deepEqual(spawner.calls[0]?.args, ['http://127.0.0.1:4321/']);
    assert.match(c.err.join(''), /could not open a browser/);
    stop.abort();
    assert.equal(await done, 0);
  });

  it('picks the opener per platform', () => {
    assert.equal(openerFor('darwin', 'u').command, 'open');
    assert.equal(openerFor('win32', 'u').command, 'cmd');
    assert.equal(openerFor('linux', 'u').command, 'xdg-open');
  });

  it('serves a real lab on a free port and exits 0 when stopped', async () => {
    const c = capture();
    const stop = new AbortController();
    const done = main(['lab', '--port', '0'], c.io, gwDeps(), { stop: stop.signal });
    let url = '';
    for (let i = 0; i < 100 && !url; i++) {
      url = /(http:\/\/127\.0\.0\.1:\d+\/)/.exec(c.out.join(''))?.[1] ?? '';
      if (!url) await new Promise((r) => setTimeout(r, 10));
    }
    assert.ok(url, 'printed a URL');
    const r = await call(Number(new URL(url).port), 'GET', '/api/state', { headers: { Host: new URL(url).host } });
    assert.equal(r.status, 200);
    stop.abort();
    assert.equal(await done, 0);
  });

  it('exits 1 with the reason on stderr when the port is taken (Req 15.3)', async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const port = (blocker.address() as { port: number }).port;
    try {
      const c = capture();
      assert.equal(await main(['lab', '--port', String(port)], c.io, gwDeps()), 1);
      assert.match(c.err.join(''), /already in use/);
      assert.equal(c.out.join(''), '');
    } finally {
      blocker.close();
    }
  });
});

describe('lab as a real process', () => {
  it('prints its URL, serves, and exits 0 on SIGINT (Req 15.1)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sw-lab-'));
    const child = spawn(process.execPath, [join(root, 'src', 'cli.ts'), 'lab', '--port', '0'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    const exited = new Promise<number | null>((r) => child.on('close', r));
    try {
      for (let i = 0; i < 300 && !/http:\/\/127\.0\.0\.1:\d+\//.test(out); i++) await new Promise((r) => setTimeout(r, 20));
      const url = /(http:\/\/127\.0\.0\.1:\d+\/)/.exec(out)?.[1];
      assert.ok(url, out);
      const res = await fetch(url);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /Stitchwork lab/);
      child.kill('SIGINT');
      assert.equal(await exited, 0);
    } finally {
      child.kill('SIGKILL');
    }
  });
});
