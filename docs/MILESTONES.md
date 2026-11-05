# Milestones

Submission deadline: **2026-12-04 14:00 PT** (2026-12-05 06:00 China time). Dates below are targets.

## M1 — MVP gateway ✅ (2026-11-05)
- MCP stdio server, four adapters, shared rolling-window ledger, router, skills, CLI.
- 76 tests (unit, property-based, end-to-end MCP, real-process smoke) green.
- Demo stand-in agents in `examples/fake-agents/` so judges can try it without paid subscriptions.

## M2 — Real-world hardening (target 2026-11-14)
- Verify every adapter against the current real CLIs (Codex `exec --json`, Claude `--output-format stream-json`, Gemini `--output-format json`, OpenCode `run --format json`) and update parsers with recorded fixtures.
- Streaming: forward agent progress as MCP `notifications/progress`.
- Cancellation: honour `notifications/cancelled` by killing the child.
- `npm run build` that emits JS so `npm i -g stitchwork` works (Node does not strip types inside `node_modules`).

## M3 — The "lab" dashboard (target 2026-11-24, also the Design score)
- `stitchwork lab`: a small local web UI (Halloween "operating table" theme) showing each agent as a limb with live quota gauges, recent runs, and a skill launcher.
- Quota import: optional readers for vendor usage endpoints / local CLI usage files to seed the ledger with usage made outside the gateway.
- Fallback chains: on `ok: false` from rate-limit errors, retry on the next eligible agent automatically.

## M4 — Kiro showcase and submission (target 2026-12-01)
- Second spec (`.kiro/specs/lab-dashboard/`) built entirely through Kiro's spec flow; keep its history.
- Custom Kiro agent + more hooks (release-notes hook, quota-budget guard hook).
- Write `docs/KIRO_USAGE.md` from real experience, record the 3-minute video, publish blog + #KiroweenHackathon26 post for bonus prizes.
- Final Devpost submission by 2026-12-03 (one day of buffer).
