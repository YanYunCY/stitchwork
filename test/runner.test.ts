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
