import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess, SpawnOptions } from 'node:child_process';

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface ProcessSpec {
  binary: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  notFound: boolean;
  durationMs: number;
}

export const MAX_STREAM_BYTES = 1024 * 1024;
const KILL_GRACE_MS = 2000;

function collector() {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    push(chunk: Buffer | string) {
      if (size >= MAX_STREAM_BYTES) return;
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      const room = MAX_STREAM_BYTES - size;
      chunks.push(buf.length > room ? buf.subarray(0, room) : buf);
      size += Math.min(buf.length, room);
    },
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}

/** Run a CLI without a shell; never throws (Req 1.5–1.7). */
export function runProcess(
  spec: ProcessSpec,
  spawnFn: SpawnFn = nodeSpawn,
  now: () => number = Date.now,
): Promise<ProcessResult> {
  const started = now();
  return new Promise((resolve) => {
    const out = collector();
    const err = collector();
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const finish = (exitCode: number | null, notFound = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ stdout: out.text(), stderr: err.text(), exitCode, timedOut, notFound, durationMs: now() - started });
    };

    let child: ChildProcess;
    try {
      child = spawnFn(spec.binary, spec.args, {
        cwd: spec.cwd,
        env: spec.env ?? process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      err.push(String((e as Error).message));
      settled = true;
      resolve({ stdout: '', stderr: err.text(), exitCode: null, timedOut: false, notFound: code === 'ENOENT', durationMs: now() - started });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      killTimer.unref?.();
    }, spec.timeoutMs);

    child.stdout?.on('data', (c: Buffer) => out.push(c));
    child.stderr?.on('data', (c: Buffer) => err.push(c));
    child.on('error', (e: NodeJS.ErrnoException) => {
      err.push(e.message);
      finish(null, e.code === 'ENOENT');
    });
    child.on('close', (code) => finish(code));
  });
}
