import { request } from 'node:http';
import { mergeConfig } from '../src/config.ts';
import { Gateway } from '../src/gateway.ts';
import type { GatewayDeps } from '../src/gateway.ts';
import { startLab } from '../src/lab/server.ts';
import type { LabHandle, LabOptions } from '../src/lab/server.ts';
import { memoryStore } from '../src/quota/ledger.ts';
import { SkillRegistry } from '../src/skills/registry.ts';
import { fakeSpawn } from './helpers.ts';
import type { FakeBehaviour } from './helpers.ts';

export interface Resp { status: number; headers: Record<string, string | string[] | undefined>; text: string; json: any }

/** Raw http.request so tests can set Host and Origin freely (fetch cannot). */
export function call(port: number, method: string, path: string, opts: { headers?: Record<string, string>; body?: string } = {}): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: unknown;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

export const SKILLS = (() => {
  const s = new SkillRegistry();
  s.add('explain.md', '---\nname: explain\ndescription: Explain code\nagents: [gemini]\n---\nExplain {{input}}');
  s.add('review.md', '---\nname: review\ndescription: Review code\n---\nReview {{input}}');
  return s;
})();

export async function startTestLab(opts: { readOnly?: boolean; behaviour?: FakeBehaviour | ((c: { command: string }) => FakeBehaviour); deps?: GatewayDeps } = {}) {
  const store = memoryStore();
  const spawn = fakeSpawn((opts.behaviour ?? { stdout: 'ok\ntokens used: 5\n' }) as FakeBehaviour);
  const gw = new Gateway(mergeConfig({}, '/tmp'), { spawn: spawn.fn, store, skills: SKILLS, which: () => true, env: {}, log: () => {}, ...opts.deps });
  const lab: LabHandle = await startLab(gw, { port: 0, readOnly: opts.readOnly ?? false } satisfies LabOptions);
  const base = { Host: `127.0.0.1:${lab.port}` };
  return { gw, store, spawn, lab, base, get: (path: string, headers: Record<string, string> = {}) => call(lab.port, 'GET', path, { headers: { ...base, ...headers } }) };
}
