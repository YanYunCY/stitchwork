import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Gateway } from '../gateway.ts';
import * as api from './api.ts';
import { hostAllowed, postAllowed } from './guard.ts';
import { err, send } from './http.ts';
import type { Reply, RouteTable } from './http.ts';
import { createLauncher } from './launch.ts';
import { renderPage } from './page.ts';

export const DEFAULT_LAB_PORT = 7777;
/** The only address the lab ever binds to (Req 15.4). */
export const LAB_HOST = '127.0.0.1';

export interface LabOptions {
  port: number;
  readOnly: boolean;
  log?: (msg: string) => void;
  now?: () => number;
}

export interface LabHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

/**
 * Start the lab on 127.0.0.1 (Req 15). Routes are an exact-match table: no
 * filesystem lookup is ever derived from the URL (Req 19.5).
 */
export function startLab(gw: Gateway, opts: LabOptions): Promise<LabHandle> {
  const log = opts.log ?? (() => {});
  const now = opts.now ?? Date.now;
  const launcher = createLauncher(gw, opts.readOnly, log);
  const routes: RouteTable = {
    'GET /': () => ({ status: 200, body: null, html: renderPage(opts.readOnly) }),
    'GET /api/state': () => api.state(gw, opts.readOnly, now()),
    'GET /api/runs': () => api.runs(gw),
    'GET /api/skills': () => api.skills(gw),
    ...launcher.routes,
  };
  const methodsFor = new Map<string, string[]>();
  for (const key of Object.keys(routes)) {
    const [method, path] = key.split(' ') as [string, string];
    methodsFor.set(path, [...(methodsFor.get(path) ?? []), method]);
  }

  let port = 0;
  const server: Server = createServer((req, res) => {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0] as string;
    const reply = async (): Promise<Reply> => {
      if (!hostAllowed(req.headers.host, port)) return err(403, 'Forbidden host');
      if (method === 'POST' && !postAllowed(req.headers, port)) return err(403, 'Forbidden origin');
      const allowed = methodsFor.get(path);
      if (!allowed) return err(404, 'Not found');
      const handler = routes[`${method} ${path}`];
      if (!handler) return err(405, 'Method not allowed', { Allow: allowed.join(', ') });
      return handler({ req, res });
    };
    reply().then((r) => send(res, r), (e: unknown) => {
      log(`lab error: ${(e as Error).stack ?? String(e)}`);
      send(res, err(500, (e as Error).message || 'Internal error'));
    });
  });

  return new Promise<LabHandle>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, LAB_HOST, () => {
      server.off('error', reject);
      port = (server.address() as AddressInfo).port;
      const url = `http://${LAB_HOST}:${port}/`;
      resolve({
        url, port,
        close: () => new Promise<void>((done) => {
          launcher.shutdown();
          server.close(() => done());
          server.closeAllConnections();
        }),
      });
    });
  });
}
