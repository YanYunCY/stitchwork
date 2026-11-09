import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import { startLab } from '../src/lab/server.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { AGENT_IDS } from '../src/types.ts';
import { call } from './lab-helpers.ts';

const root = join(import.meta.dirname, '..');
const POST_HEADERS = { 'Content-Type': 'application/json' };

describe('lab against the demo config (Req 15.1)', () => {
  it('the demo config points every agent at a bundled stand-in', () => {
    const cfg = loadConfig(join('examples', 'demo.config.json'), root);
    for (const id of AGENT_IDS) assert.equal(cfg.agents[id].binary, join(root, 'examples', 'fake-agents', id));
  });

  it('shows the demo limits and launches a skill on the stand-in agents', async () => {
    const gw = new Gateway(loadConfig(join('examples', 'demo.config.json'), root), { store: memoryStore(), log: () => {} });
    const lab = await startLab(gw, { port: 0, readOnly: false });
    try {
      const host = { Host: `127.0.0.1:${lab.port}` };
      const state = await call(lab.port, 'GET', '/api/state', { headers: host });
      const claude = state.json.agents.find((a: { id: string }) => a.id === 'claude');
      assert.equal(claude.quota.requestLimit, 2);
      assert.equal(claude.available, true, 'the stand-in is executable');
      const r = await call(lab.port, 'POST', '/api/launch', { headers: { ...host, ...POST_HEADERS }, body: JSON.stringify({ skill: 'explain', input: 'src/router.ts' }) });
      assert.equal(r.status, 200);
      assert.equal(r.json.ok, true);
      assert.match(r.json.output, /\[gemini\]/);
      const runs = await call(lab.port, 'GET', '/api/runs', { headers: host });
      assert.equal(runs.json.runs.length, 1);
      assert.equal(runs.json.runs[0].agent, 'gemini');
      assert.equal(typeof runs.json.runs[0].durationMs, 'number');
    } finally {
      await lab.close();
    }
  });
});

describe('lab from the published build (Req 15.2, 15.6)', () => {
  let out = '';
  let work = '';
  before(() => {
    out = mkdtempSync(join(tmpdir(), 'stitchwork-labbuild-'));
    work = mkdtempSync(join(tmpdir(), 'stitchwork-labwork-'));
    execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.build.json'), '--outDir', out], { cwd: root });
    const demo = JSON.parse(readFileSync(join(root, 'examples', 'demo.config.json'), 'utf8')) as { agents: Record<string, { binary: string }> };
    for (const id of AGENT_IDS) (demo.agents[id] as { binary: string }).binary = join(root, 'examples', 'fake-agents', id);
    writeFileSync(join(work, 'cfg.json'), JSON.stringify({ ...demo, ledgerPath: join(work, 'ledger.jsonl'), skillsDir: join(root, 'skills') }));
  });
  after(() => {
    rmSync(out, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  });

  it('`node dist/cli.js lab --port 0` serves the page, the API and a launch, then exits 0 on SIGINT', async () => {
    const child = spawn(process.execPath, [join(out, 'cli.js'), 'lab', '--port', '0', '--config', join(work, 'cfg.json')], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    const exited = new Promise<number | null>((r) => child.on('close', r));
    try {
      for (let i = 0; i < 300 && !/http:\/\/127\.0\.0\.1:\d+\//.test(stdout); i++) await new Promise((r) => setTimeout(r, 20));
      const url = /(http:\/\/127\.0\.0\.1:\d+\/)/.exec(stdout)?.[1];
      assert.ok(url, stdout);
      const page = await fetch(url);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /Stitchwork lab/);
      assert.doesNotMatch(html, /https?:\/\//);
      const state = (await (await fetch(new URL('/api/state', url))).json()) as { agents: { id: string; available: boolean }[] };
      assert.deepEqual(state.agents.map((a) => a.id), [...AGENT_IDS]);
      assert.ok(state.agents.every((a) => a.available));
      const launch = await fetch(new URL('/api/launch', url), { method: 'POST', headers: POST_HEADERS, body: JSON.stringify({ skill: 'explain', input: 'x' }) });
      const body = (await launch.json()) as { ok: boolean; output: string };
      assert.equal(body.ok, true);
      assert.match(body.output, /\[gemini\]/);
      assert.match(readFileSync(join(work, 'ledger.jsonl'), 'utf8'), /"agent":"gemini"/);
      child.kill('SIGINT');
      assert.equal(await exited, 0);
    } finally {
      child.kill('SIGKILL');
    }
  });
});
