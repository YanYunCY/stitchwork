import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../src/runner.ts';
import { fakeSpawn } from './helpers.ts';

describe('runProcess', () => {
  it('captures stdout, stderr and exit code without a shell', async () => {
    const fake = fakeSpawn({ stdout: 'out', stderr: 'err', exitCode: 3 });
    const r = await runProcess({ binary: 'claude', args: ['-p', 'x'], timeoutMs: 1000 }, fake.fn);
    assert.equal(r.stdout, 'out');
    assert.equal(r.stderr, 'err');
    assert.equal(r.exitCode, 3);
    assert.equal(r.timedOut, false);
    assert.deepEqual(fake.calls[0]?.args, ['-p', 'x']);
  });

  it('kills the child on timeout (Req 1.6)', async () => {
    const fake = fakeSpawn({ hang: true });
    const r = await runProcess({ binary: 'codex', args: [], timeoutMs: 20 }, fake.fn);
    assert.equal(r.timedOut, true);
    assert.deepEqual(fake.signals, ['SIGTERM']);
  });

  it('reports a missing binary (Req 1.7)', async () => {
    const fake = fakeSpawn({ missing: true });
    const r = await runProcess({ binary: 'gemini', args: [], timeoutMs: 1000 }, fake.fn);
    assert.equal(r.notFound, true);
    assert.equal(r.exitCode, null);
  });

  it('passes the environment through untouched (Req 6.3)', async () => {
    const fake = fakeSpawn({});
    const env = { OPENAI_API_KEY: 'from-env' };
    await runProcess({ binary: 'codex', args: [], timeoutMs: 1000, env }, fake.fn);
    assert.equal(fake.calls[0]?.env, env);
  });

  it('handles a spawn function that throws synchronously', async () => {
    const r = await runProcess({ binary: 'x', args: [], timeoutMs: 1000 }, () => {
      throw Object.assign(new Error('nope'), { code: 'ENOENT' });
    });
    assert.equal(r.notFound, true);
  });
});

describe('runProcess abort and streaming (Req 9.2, 10.1)', () => {
  it('kills the child when the signal aborts and marks it cancelled', async () => {
    const fake = fakeSpawn({ hang: true });
    const ac = new AbortController();
    const p = runProcess({ binary: 'claude', args: [], timeoutMs: 10_000, signal: ac.signal }, fake.fn);
    setTimeout(() => ac.abort(), 10);
    const r = await p;
    assert.equal(r.cancelled, true);
    assert.equal(r.timedOut, false);
    assert.deepEqual(fake.signals, ['SIGTERM']);
  });

  it('does not spawn at all when already aborted', async () => {
    const fake = fakeSpawn({ stdout: 'x' });
    const ac = new AbortController();
    ac.abort();
    const r = await runProcess({ binary: 'claude', args: [], timeoutMs: 1000, signal: ac.signal }, fake.fn);
    assert.equal(r.cancelled, true);
    assert.equal(fake.calls.length, 0);
  });

  it('streams stdout chunks and survives a throwing sink', async () => {
    const fake = fakeSpawn({ stdout: 'hello' });
    const seen: string[] = [];
    const r = await runProcess({ binary: 'claude', args: [], timeoutMs: 1000, onStdout: (c) => { seen.push(c); throw new Error('sink'); } }, fake.fn);
    assert.equal(r.stdout, 'hello');
    assert.deepEqual(seen, ['hello']);
  });

  it('aborts a real child process', async () => {
    const ac = new AbortController();
    const p = runProcess({ binary: process.execPath, args: ['-e', 'setTimeout(() => {}, 30000)'], timeoutMs: 20_000, signal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    const r = await p;
    assert.equal(r.cancelled, true);
    assert.ok(r.durationMs < 5000);
  });
});
