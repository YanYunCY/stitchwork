import { spawn as nodeSpawn } from 'node:child_process';
import type { Gateway } from '../gateway.ts';
import type { SpawnFn } from '../runner.ts';
import { DEFAULT_LAB_PORT, startLab } from './server.ts';
import type { LabHandle, LabOptions } from './server.ts';

export interface LabCliDeps {
  /** replaces the HTTP server (tests) */
  startLab?: (gw: Gateway, opts: LabOptions) => Promise<LabHandle>;
  /** spawn used for --open; tests inject a fake (never opens a real browser) */
  spawn?: SpawnFn;
  /** resolves the "interrupted" moment; defaults to SIGINT/SIGTERM on the process */
  stop?: AbortSignal;
  platform?: NodeJS.Platform;
}

export interface LabIO { stdout: (s: string) => void; stderr: (s: string) => void }

/** The platform's "open this URL" command. */
export function openerFor(platform: NodeJS.Platform, url: string): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

function processStop(): { signal: AbortSignal; dispose: () => void } {
  const c = new AbortController();
  const onSig = () => c.abort();
  process.once('SIGINT', onSig);
  process.once('SIGTERM', onSig);
  return { signal: c.signal, dispose: () => { process.off('SIGINT', onSig); process.off('SIGTERM', onSig); } };
}

/** `stitchwork lab [--port n] [--open] [--read-only]` (Req 15.1, 15.3, 15.4). Returns the exit code. */
export async function runLab(gw: Gateway, flags: Record<string, string>, io: LabIO, deps: LabCliDeps = {}): Promise<number> {
  if ('host' in flags) {
    io.stderr('stitchwork lab only listens on 127.0.0.1; --host is not supported.\n');
    return 2;
  }
  const port = flags.port === undefined ? DEFAULT_LAB_PORT : Number(flags.port);
  if (flags.port === '' || !Number.isInteger(port) || port < 0 || port > 65535) {
    io.stderr('--port must be an integer from 0 to 65535\n');
    return 2;
  }
  const readOnly = flags['read-only'] !== undefined;
  const start = deps.startLab ?? startLab;
  let lab: LabHandle;
  try {
    lab = await start(gw, { port, readOnly, log: (m) => io.stderr(`[stitchwork] ${m}\n`) });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    io.stderr(code === 'EADDRINUSE'
      ? `Cannot start the lab: port ${port} is already in use. Pick another with --port <n>.\n`
      : `Cannot start the lab: ${(e as Error).message}\n`);
    return 1;
  }
  io.stdout(`🧟 Stitchwork lab is on the table: ${lab.url}\n`);
  if (readOnly) io.stdout('   read-only: the skill launcher is switched off.\n');
  io.stdout('   Press Ctrl+C to close it.\n');

  if (flags.open !== undefined) {
    const { command, args } = openerFor(deps.platform ?? process.platform, lab.url);
    const warn = (why: string) => io.stderr(`[stitchwork] could not open a browser (${why}); open ${lab.url} yourself.\n`);
    try {
      const child = (deps.spawn ?? nodeSpawn)(command, args, { stdio: 'ignore', detached: true });
      child.on('error', (e) => warn(e.message));
      child.unref?.();
    } catch (e) {
      warn((e as Error).message);
    }
  }

  const own = deps.stop ? undefined : processStop();
  const signal = (deps.stop ?? own?.signal) as AbortSignal;
  if (!signal.aborted) await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
  own?.dispose();
  await lab.close();
  io.stdout('Lab closed.\n');
  return 0;
}
