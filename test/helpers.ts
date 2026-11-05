import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import type { SpawnFn } from '../src/runner.ts';

export interface FakeBehaviour {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** never exit on its own (for timeout tests) */
  hang?: boolean;
  /** emit ENOENT like a missing binary */
  missing?: boolean;
}

export interface SpawnCall { command: string; args: readonly string[]; env: NodeJS.ProcessEnv | undefined }

/** A fake child_process.spawn that never touches the real system. */
export function fakeSpawn(behave: FakeBehaviour | ((call: SpawnCall) => FakeBehaviour)) {
  const calls: SpawnCall[] = [];
  const signals: string[] = [];
  const fn: SpawnFn = (command, args, options) => {
    const call = { command, args, env: options.env };
    calls.push(call);
    const b = typeof behave === 'function' ? behave(call) : behave;
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, {
      stdout, stderr,
      kill: (sig: string) => {
        signals.push(sig);
        setImmediate(() => child.emit('close', null));
        return true;
      },
    });
    setImmediate(() => {
      if (b.missing) {
        const e = Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' });
        child.emit('error', e);
        return;
      }
      if (b.stdout) stdout.write(b.stdout);
      if (b.stderr) stderr.write(b.stderr);
      if (!b.hang) setImmediate(() => child.emit('close', b.exitCode ?? 0));
    });
    return child;
  };
  return { fn, calls, signals };
}
