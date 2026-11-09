# Implementation plan: M3 — the lab

- [x] 1. Ledger records duration and fallbacks
  - [x] 1.1 Optional `durationMs` and `fallbacks` on `UsageEvent`; `record` and `parseEvent` normalise them; old lines stay valid. _Req 17.2, 17.5_
  - [x] 1.2 Gateway passes `proc.durationMs` and `fallbacks.length` into each recorded attempt. _Req 17.2_
  - [x] 1.3 Property P8. _Req 17.2, 17.5_

- [x] 2. `recentRuns` and `gaugeFill`
  - Pure helpers over ledger lines and snapshots; property tests P7 and P12. _Req 16.3, 17.1, 17.3_

- [x] 3. Request guard
  - `src/lab/guard.ts` with `hostAllowed` and `originAllowed`; property P9. _Req 15.5, 19.4_

- [x] 4. Read-only API
  - `src/lab/api.ts`: `state`, `runs`, `skills` handlers returning `{ status, body }`. _Req 16.1, 17.1, 17.3, 18.1_

- [x] 5. Server skeleton
  - [x] 5.1 `src/lab/server.ts`: `startLab` on 127.0.0.1, route table, 404/405/403 handling, no filesystem lookups from URLs, `EADDRINUSE` rejection. _Req 15.1–15.5, 19.1, 19.5_
  - [x] 5.2 HTTP tests on port 0 with a fake `spawn`; property P10. _Req 15.4, 19.1, 19.2_

- [x] 6. Launch endpoint
  - [x] 6.1 `src/lab/launch.ts`: body validation, single-flight 409, `AbortController`, status endpoint, cancel, abort on socket close. _Req 18.3, 18.4, 18.6, 18.7_
  - [x] 6.2 `--read-only` flag returns 403 on launch. _Req 19.3_
  - [x] 6.3 Property P11 and HTTP tests for launch, cancel and refusal. _Req 18.3–18.7_

- [x] 7. The operating-table page
  - [x] 7.1 `page.ts`, `page-css.ts`, `page-js.ts`: limbs, glass-tube gauges, cooldown and exhausted states, dimmed unavailable limbs, 2 s polling with "disconnected" state. _Req 15.6, 16.2–16.6_
  - [x] 7.2 Tray of the last 20 runs and the skill launcher with Run and Cancel; output via `textContent`. _Req 17.4, 18.2, 18.5, 19.3_
  - [x] 7.3 Page tests: no remote asset URLs, inline JS parses, read-only hides the launcher. _Req 15.6, 19.3_

- [x] 8. CLI command
  - `stitchwork lab [--port] [--open] [--read-only]` in `cli.ts` and `USAGE`; prints the URL; SIGINT closes cleanly; no `--host`. Tests through `main()` with injected deps. _Req 15.1, 15.3, 15.4_

- [x] 9. Demo and build integration
  - `lab` works against the `demo` config; `npm run build` output serves the page; a test starts `dist/cli.js lab --port 0` against the fake agents. _Req 15.1, 15.2, 15.6_

- [x] 10. Docs
  - README (both languages) section for `lab`, screenshots in `docs/`, `docs/MILESTONES.md` (point M3 at `.kiro/specs/m3-lab`), `docs/DEMO_SCRIPT.md` lab segment, `docs/KIRO_USAGE.md` entry for this spec.
