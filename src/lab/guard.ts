import type { IncomingHttpHeaders } from 'node:http';

/** Host must be exactly 127.0.0.1:<port> or localhost:<port> (Req 15.5, DNS rebinding). */
export function hostAllowed(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** Origin must be exactly http://127.0.0.1:<port> or http://localhost:<port> (Req 19.4). */
export function originAllowed(origin: string | undefined, port: number): boolean {
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}

/**
 * Full POST check: a present Origin must pass `originAllowed`; an absent one is
 * accepted only from non-browser clients, i.e. when the browser has not marked
 * the request as cross-site.
 */
export function postAllowed(headers: IncomingHttpHeaders, port: number): boolean {
  const origin = headers.origin;
  if (origin !== undefined) return originAllowed(origin, port);
  return headers['sec-fetch-site'] !== 'cross-site';
}
