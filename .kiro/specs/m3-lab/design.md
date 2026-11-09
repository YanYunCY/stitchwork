# Design: M3 — the lab

## Overview
The lab is a thin, read-mostly HTTP layer over the existing `Gateway`. It adds no runtime dependency and no new source of truth: state comes from `gateway.agents()`, the ledger file and the skill registry; the only write path is `Gateway.run`.

```
browser ──GET /──────────────▶ page.ts (one HTML doc, inline CSS+JS)
        ──GET /api/state ────▶ api.ts ──▶ gateway.agents()  (quota snapshots, cooldown)
        ──GET /api/runs ─────▶ api.ts ──▶ recentRuns(store, 20)  (reads ledger.jsonl)
        ──GET /api/skills ───▶ api.ts ──▶ gateway.skills
        ──POST /api/launch ──▶ launch.ts ─▶ gateway.run({ skill, input, agent }, { signal, onProgress })
        ──POST /api/launch/cancel ─▶ AbortController.abort()
```

Everything binds to `127.0.0.1` only. The Host and Origin checks run before routing.

## Components

### `src/lab/server.ts` (new)
`startLab(gw, opts): Promise<{ url, port, close() }>` where `opts = { port, readOnly, log }`. Creates `http.createServer`, listens on `127.0.0.1`, resolves with the real port (so `--port 0` works), rejects on `EADDRINUSE`. Pipeline per request: `guard` (Host, and Origin for POST) → method check → route table lookup → handler. Routes are an exact-match map keyed by `"METHOD path"`; no filesystem lookup is ever derived from the URL (Req 19.5).

### `src/lab/guard.ts` (new)
Pure functions `hostAllowed(host, port)` and `originAllowed(origin, port)`. Allowed hosts: `127.0.0.1:<port>` and `localhost:<port>`; an absent `Origin` is allowed on POST only for non-browser clients (no `Origin` and no `Sec-Fetch-Site: cross-site`).

### `src/lab/api.ts` (new)
Pure handlers returning `{ status, body }`, taking `gw` and `now`:
- `state(gw)` → `{ now, agents: AgentInfo[] }` straight from `gw.agents()`.
- `runs(store)` → `recentRuns(store.load(), 20)`.
- `skills(gw)` → name, description, agents.
- All responses are JSON with `Cache-Control: no-store`.

### `src/lab/launch.ts` (new)
Holds `current: { controller, agent? } | null`. `launch(body)`:
1. Validate (JSON, ≤ 64 KiB, known skill, agent id or `auto`) → 400 otherwise.
2. If `current` is set → 409.
3. Create an `AbortController`; call `gw.run({ skill, input, agent }, { signal, onProgress })`, remembering the routed agent from the `routed` progress event.
4. Return `{ ok, refused?, reason?, agent, output, tokens, estimated, durationMs, fallbacks }`; clear `current` in `finally`.
The response socket's `close` event before completion aborts the controller (Req 18.6). The page polls `/api/state` anyway, and learns the routed agent from `GET /api/launch/status` → `{ running, agent }`.

### Ledger extension (`src/quota/ledger.ts`, `src/gateway.ts`)
- `UsageEvent` gains optional `durationMs?: number` and `fallbacks?: number`. `record` copies them only when finite, non-negative and (for `fallbacks`) > 0, rounded to integers. `parseEvent` reads them with the same checks. Old lines remain valid.
- `Gateway.attempt` already holds `proc.durationMs`; the failover loop passes `fallbacks.length` into `attempt`. No other module changes.
- New pure `recentRuns(lines: string[], n: number): RunRow[]` parses with `parseEvent`, sorts by `ts` descending (stable), takes `n`. It reads lines, not the in-memory window, so old runs show (Req 17.3).

### CLI
`stitchwork lab [--port n] [--open] [--read-only]` added to `cli.ts` and `USAGE`. `--open` shells out to `xdg-open`/`open`/`start` through the injectable `spawn`; failure to open only logs to stderr. SIGINT closes the server and exits 0. There is no `--host`.

### Page (`src/lab/page.ts`, `page-css.ts`, `page-js.ts`)
One HTML string assembled from three modules to keep each file under ~200 lines. No remote assets.
- **Table**: dark slab background, subtle stitched border (`border: 2px dashed`), flicker on state change.
- **Limbs**: four cards laid out like a body (arm, arm, leg, leg) with a bolt in each corner. Each has two gauges: a glass tube whose "green glow" fill is `1 - used/limit` clamped to `[0,1]`, shifting amber under 30% and red under 10%. Cooldown shows a "stitches healing" badge with a countdown; exhausted shows a red tube with no glow; unavailable or disabled is dimmed with the reason.
- **Tray**: the last 20 runs as a table: agent, ✓/✗, tokens (`~` when estimated), duration, and a 🧵 marker for fallbacks or rate limits.
- **Launcher**: a skill select, textarea and a "⚡ Run" button, plus Cancel. Output renders as `textContent` (never `innerHTML`), so agent output cannot inject script.
- Polling uses `setTimeout` chaining (2 s), not `setInterval`, so slow responses never pile up. Three failures show "disconnected".
- Respects `prefers-reduced-motion`; all controls are labelled and keyboard reachable; the gauges expose `role="meter"` with `aria-valuenow`.

## Data models
```ts
type RunRow = { ts: number; agent: AgentId; ok: boolean; tokens: number; estimated: boolean;
                durationMs?: number; fallbacks?: number; rateLimited?: boolean };
type LabState = { now: number; readOnly: boolean; agents: AgentInfo[] };
type LaunchBody = { skill: string; input: string; agent?: AgentId | 'auto' };
```

## Correctness properties
- **P7 (recent runs)**: for any list of ledger lines, including malformed ones and lines without the new fields, `recentRuns(lines, 20)` has length `min(20, validCount)`, is sorted by `ts` descending, and equals the last 20 valid events by `ts`.
- **P8 (ledger round trip and privacy)**: for any valid `UsageEvent`, `parseEvent(JSON.stringify(record(e)))` equals `e` with `durationMs` and `fallbacks` normalised to non-negative integers (`fallbacks` omitted at 0), and the serialised line has no keys beyond `ts, agent, tokens, ok, estimated, rateLimited, durationMs, fallbacks`.
- **P9 (host and origin guard)**: for any `host`, `origin` and `port`, `hostAllowed` is true iff `host` is exactly `127.0.0.1:<port>` or `localhost:<port>`, and `originAllowed` is true iff `origin` is exactly `http://127.0.0.1:<port>` or `http://localhost:<port>`.
- **P10 (read-only)**: for any sequence of requests that contains no accepted `POST /api/launch`, the ledger store receives zero appends, `gateway.run` is never called, and every non-GET request outside the two launch routes gets 405.
- **P11 (single launch)**: for any number `n ≥ 1` of concurrent valid launches against a gateway whose `run` stays pending, exactly one reaches `gateway.run` and the other `n − 1` get 409; after it settles, a new launch is accepted.
- **P12 (gauge fill)**: for any `used ≥ 0` and `limit > 0`, `gaugeFill(used, limit)` is in `[0,1]` and non-increasing in `used`; for no limit it is `null`.

## Error handling
- Unknown route → 404 `{ error }`; wrong method → 405 with `Allow`; bad Host/Origin → 403; bad body → 400; second launch → 409; read-only launch → 403.
- A gateway exception in a launch returns 500 `{ error: message }` with the stack on stderr only.
- A missing or unreadable ledger file yields an empty run list, not an error.
- Port in use → stderr message and exit 1 (Req 15.3).
- Secrets: the lab never reads `process.env` and never includes config `binary` paths beyond what `agents_list` already shows.

## Testing
- Unit: `guard`, `recentRuns`, `gaugeFill`, ledger new fields, `api` handlers against a memory store and a fake `which`.
- HTTP: `startLab` on port 0 with a fake `spawn`, asserting statuses, headers, 127.0.0.1 binding, `Host`/`Origin` rejection, 405/404/409/403/400, launch round trip and abort on socket close.
- Property (fast-check): P7–P12. No test spawns a real agent CLI.
- Page: the served HTML contains no `http://` or `https://` asset references, and the inline JS parses (`new Function`) without error. Screenshots of the page are taken manually for the submission.
