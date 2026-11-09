import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fc from 'fast-check';
import { startLab } from '../src/lab/server.ts';
import { call, startTestLab } from './lab-helpers.ts';

describe('lab server (Req 15, 19)', () => {
  let t: Awaited<ReturnType<typeof startTestLab>>;
  before(async () => { t = await startTestLab(); });
  after(async () => { await t.lab.close(); });

  it('binds to 127.0.0.1 only and reports a real port (Req 15.1, 15.4)', async () => {
    const addr = t.lab.url;
    assert.match(addr, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.ok(t.lab.port > 0);
  });

  it('serves state, runs and skills as no-store JSON', async () => {
    for (const [path, key] of [['/api/state', 'agents'], ['/api/runs', 'runs'], ['/api/skills', 'skills']] as const) {
      const r = await t.get(path);
      assert.equal(r.status, 200, path);
      assert.match(String(r.headers['content-type']), /application\/json/);
      assert.equal(r.headers['cache-control'], 'no-store');
      assert.ok(Array.isArray(r.json[key]), path);
    }
    assert.deepEqual((await t.get('/api/skills')).json.skills.map((s: { name: string }) => s.name), ['explain', 'review']);
  });

  it('serves the page as HTML with a locked-down CSP (Req 15.6)', async () => {
    const r = await t.get('/');
    assert.equal(r.status, 200);
    assert.match(String(r.headers['content-type']), /text\/html/);
    assert.match(String(r.headers['content-security-policy']), /default-src 'none'/);
  });

  it('answers 403 for a foreign Host, including a missing one (Req 15.5)', async () => {
    assert.equal((await call(t.lab.port, 'GET', '/api/state', { headers: { Host: 'evil.example' } })).status, 403);
    assert.equal((await call(t.lab.port, 'GET', '/api/state', { headers: { Host: `127.0.0.1:${t.lab.port + 1}` } })).status, 403);
    assert.equal((await t.get('/api/state', { Host: `localhost:${t.lab.port}` })).status, 200);
  });

  it('answers 404 JSON for unknown paths and never reads files (Req 19.5)', async () => {
    for (const p of ['/nope', '/package.json', '/../package.json', '/%2e%2e/package.json', '/src/cli.ts', '/api/state/x']) {
      const r = await t.get(p);
      assert.equal(r.status, 404, p);
      assert.deepEqual(Object.keys(r.json), ['error']);
    }
  });

  it('ignores the query string when routing', async () => {
    assert.equal((await t.get('/api/state?x=1')).status, 200);
  });

  it('answers 405 with Allow for non-GET on read routes (Req 19.1)', async () => {
    for (const m of ['PUT', 'DELETE', 'PATCH', 'POST', 'HEAD', 'OPTIONS']) {
      const r = await call(t.lab.port, m, '/api/state', { headers: t.base });
      assert.equal(r.status, 405, m);
      assert.equal(r.headers.allow, 'GET');
    }
  });

  it('answers 403 for a cross-origin POST before routing (Req 19.4)', async () => {
    const r = await call(t.lab.port, 'POST', '/api/state', { headers: { ...t.base, Origin: 'http://evil.example' } });
    assert.equal(r.status, 403);
  });

  it('rejects when the port is taken (Req 15.3)', async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
    const port = (blocker.address() as { port: number }).port;
    try {
      await assert.rejects(startLab(t.gw, { port, readOnly: false }), (e: NodeJS.ErrnoException) => e.code === 'EADDRINUSE');
    } finally {
      blocker.close();
    }
  });

  // Feature: m3-lab, Property 10: read-only
  it('P10: no request sequence without an accepted launch appends to the ledger or runs the gateway', async () => {
    let runs = 0;
    const realRun = t.gw.run.bind(t.gw);
    t.gw.run = (...a) => { runs++; return realRun(...a); };
    const known = ['/', '/api/state', '/api/runs', '/api/skills'];
    const req = fc.record({
      method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'),
      path: fc.oneof(fc.constantFrom(...known), fc.constantFrom('/api/launch', '/api/launch/cancel'), fc.webPath()),
      hostile: fc.boolean(),
    });
    await fc.assert(fc.asyncProperty(fc.array(req, { minLength: 1, maxLength: 8 }), async (seq) => {
      for (const q of seq) {
        // POSTs to the launch routes are made hostile so none can be accepted.
        const launch = q.path.startsWith('/api/launch');
        const headers = { ...t.base, ...(q.method === 'POST' && launch ? { Origin: 'http://evil.example' } : {}) };
        const r = await call(t.lab.port, q.method, q.path, { headers, body: q.method === 'POST' ? '{}' : undefined });
        if (known.includes(q.path) && q.method !== 'GET') assert.equal(r.status, 405, `${q.method} ${q.path}`);
      }
      assert.equal(t.store.lines.length, 0);
      assert.equal(runs, 0);
    }), { numRuns: 40 });
    t.gw.run = realRun;
  });
});
