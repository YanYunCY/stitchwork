# Implementation plan: M2 — demo-ready gateway

- [x] 1. Rate-limit detection
  - `src/ratelimit.ts` with `isRateLimited`; table-driven tests for each vendor phrasing. _Req 8.1_

- [x] 2. Ledger cooldown
  - [x] 2.1 `rateLimited` flag on events, `cooldownMs`, `coolingUntil` in snapshots. _Req 8.1, 8.2, 8.7_
  - [x] 2.2 Property P5. _Req 8.2_

- [x] 3. Router cooldown and exclusion
  - Skip cooling agents in auto mode, refuse them explicitly, `exclude` set. _Req 8.2, 8.6_

- [x] 4. Runner abort and streaming
  - `signal` and `onStdout` on `ProcessSpec`; `cancelled` on the result. _Req 10.1, 9.2_

- [x] 5. Gateway failover, progress and cancellation
  - [x] 5.1 Config `cooldownMinutes`, `maxFallbacks`. _Req 8.2, 8.3_
  - [x] 5.2 Failover loop with `fallbacks`; no fallback for explicit runs. _Req 8.3–8.5_
  - [x] 5.3 Progress events and cancelled runs recorded with `ok: false`. _Req 9.2, 10.3_
  - [x] 5.4 Property P6. _Req 8.3, 8.4_

- [x] 6. MCP progress and cancellation
  - Progress frames with throttling; in-flight map; drop responses for cancelled ids. _Req 9.1–9.5, 10.1, 10.2, 10.4_

- [x] 7. `stitchwork doctor`
  - _Req 11.1–11.3_

- [x] 8. `stitchwork demo`
  - Fake Gemini honours `STITCHWORK_FAKE_RATE_LIMIT`; scripted scenario; integration test. _Req 12.1–12.4_

- [ ] 9. Installable build
  - `tsconfig.build.json`, `build` and `prepack` scripts, `files`, bin fallback; test that `dist/cli.js` runs `--help`. _Req 13.1–13.3_

- [ ] 10. Docs
  - README (both languages), `docs/DEMO_SCRIPT.md` re-timed to the demo command, `docs/KIRO_USAGE.md`, `docs/MILESTONES.md`.
