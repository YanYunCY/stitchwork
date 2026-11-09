import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiResponse } from './api.ts';

export interface Reply extends ApiResponse {
  /** when set, `body` is ignored and this HTML document is sent instead */
  html?: string;
  headers?: Record<string, string>;
}
export interface Ctx { req: IncomingMessage; res: ServerResponse }
export type Handler = (ctx: Ctx) => Reply | Promise<Reply>;
export type RouteTable = Record<string, Handler>;

const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'";

export function send(res: ServerResponse, reply: Reply): void {
  if (res.headersSent || res.writableEnded) return;
  const html = reply.html !== undefined;
  const payload = html ? (reply.html as string) : JSON.stringify(reply.body);
  res.writeHead(reply.status, {
    'Content-Type': html ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(html ? { 'Content-Security-Policy': PAGE_CSP } : {}),
    ...reply.headers,
  });
  res.end(payload);
}

export const err = (status: number, error: string, headers?: Record<string, string>): Reply => ({ status, body: { error }, ...(headers ? { headers } : {}) });


export const MAX_BODY_BYTES = 64 * 1024;

/** Read a request body, or `undefined` once it exceeds `limit` bytes (Req 18.7). */
export function readBody(req: IncomingMessage, limit: number = MAX_BODY_BYTES): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (over) return;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(over ? undefined : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
