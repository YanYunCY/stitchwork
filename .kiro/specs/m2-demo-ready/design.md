# Design: M2 — demo-ready gateway

## Overview
All changes stay inside the MVP's module boundaries. No runtime dependencies are added.

```
MCP client ──tools/call(+progressToken)──▶ server.ts ──▶ tools.ts ──▶ Gateway.run(req, { signal, onProgress })
     ▲                                        │                         │  loop: route → run → rate-limited? → cooldown + next
     └──── notifications/progress ◀───────────┘                         ▼
     ──── notifications/cancelled ──▶ AbortController ──▶ runner.ts (kill child)
                                                            ledger.jsonl (+ rateLimited flag)
```

## Components

### `src/ratelimit.ts` (new)
`isRateLimited(...texts: string[]): boolean` with one case-insensitive regex. Kept separate so adapters can later override it per vendor.

### Ledger
- `UsageEvent.rateLimited?: boolean`, written only when true (old lines stay valid).
- Constructor gains `cooldownMs` (default 15 min).
- `QuotaSnapshot.coolingUntil: number | null`: the latest `rateLimited` event's `ts + cooldownMs` if still in the future.
- Cooldown is independent of the usage window, so a rate-limited event is kept in memory while either the window or the cooldown still covers it.

### Router
- Auto mode skips agents with `coolingUntil !== null`, reason `rate-limited, cooling down until <ISO>`.
- Explicit mode refuses a cooling agent (Req 8.6).
- New optional `exclude` set so the gateway can skip agents already tried in this request.

### Runner
- `ProcessSpec.signal?: AbortSignal`: on abort, SIGTERM then SIGKILL after the grace period; result gets `cancelled: true`.
- `ProcessSpec.onStdout?: (chunk: string) => void` for progress.

### Gateway
`run(req, opts?: { signal?, onProgress? })`:
1. Resolve prompt (skill or raw) as before.
2. Loop up to `1 + maxFallbacks` attempts: route (excluding tried agents), emit `routed`, run, record usage (with `rateLimited` when detected).
3. If cancelled → return `{ ok: false, cancelled: true }` result.
4. If rate-limited and `routedBy === 'auto'` and attempts remain → push `{ agent, reason }` to `fallbacks`, emit `fallback`, continue. If routing then fails, return the last failure with its fallbacks.
5. Otherwise return the result with `fallbacks`.

Progress events are typed: `{ kind: 'routed' | 'output' | 'fallback' | 'done', agent, message }`.

### MCP server
- Keeps `Map<id, AbortController>` for in-flight `tools/call`.
- `notifications/cancelled` → abort; the response for that id is dropped (Req 10.2).
- If `_meta.progressToken` is present, maps gateway progress events to `notifications/progress { progressToken, progress: n++, message }`; output events throttled to one per 250 ms.

### CLI
- `doctor`: uses `runProcess` with a 5 s timeout on `<binary> --version`; prints a table, a ready count and the MCP JSON snippet.
- `demo`: copies nothing; builds a config in memory pointing each agent's `binary` at `examples/fake-agents/*` (resolved from the package root), a temp `ledgerPath`, and the bundled `skills/`. Sets `STITCHWORK_FAKE_RATE_LIMIT=gemini` only in the child env for the failover step. Narrates with ANSI colour when stdout is a TTY.

### Build
`tsconfig.build.json` extends the base config with `noEmit: false`, `outDir: dist`, `rootDir: src`, `rewriteRelativeImportExtensions: true`, `include: ["src"]`. `bin/stitchwork.js` tries `../dist/cli.js` first.

## Correctness properties
- **P5 (cooldown)**: for any sequence of events and any `now`, `coolingUntil` is non-null iff some `rateLimited` event `e` has `e.ts <= now < e.ts + cooldownMs`, and then equals the max such `e.ts + cooldownMs`.
- **P6 (failover bound)**: for any pattern of rate-limited agents, an auto run makes at most `1 + maxFallbacks` attempts, never tries the same agent twice, and `fallbacks.length === attempts - 1`.

## Error handling
- Cancelling a request that already finished is a no-op.
- A doctor `--version` that times out prints `version: (no answer in 5s)`.
- A missing fake agent in `demo` (broken install) prints the path and exits 1.

## Testing
- Unit: `isRateLimited`, ledger cooldown, router skip, runner abort, gateway failover and progress, MCP progress/cancel framing, doctor and demo via `main()` with injected deps.
- Property: P5, P6 with fast-check.
- Integration: `stitchwork demo` runs the real fake agents as child processes and its output is asserted step by step.
