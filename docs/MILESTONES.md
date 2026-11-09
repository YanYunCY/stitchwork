# Milestones

Submission deadline: **2026-12-04 14:00 PT** (2026-12-05 06:00 China time). Dates below are targets.

## M1 — MVP gateway ✅ (2026-11-05)
- MCP stdio server, four adapters, shared rolling-window ledger, router, skills, CLI.
- Spec: `.kiro/specs/mvp-gateway` (Requirements 1–7, properties P1–P4).

## M2 — Demo-ready ✅ (2026-11-07)
- Rate-limit failover with a cooldown persisted in the ledger; explicit runs never fail over.
- MCP `notifications/progress` (throttled, ≤200 chars) and `notifications/cancelled` (kills the child, no response sent).
- `stitchwork doctor` and `stitchwork demo` (bundled stand-in CLIs, temp ledger, `--pace` for recording).
- `npm run build` emits `dist/`; `npm install -g .` verified locally; CI builds and runs the demo.
- Spec: `.kiro/specs/m2-demo-ready` (Requirements 8–13, properties P5–P6). 123 tests green.

## M3 — Real CLIs and the lab (target 2026-11-24)
- ✅ 2026-11-09: adapters verified against Codex 0.167.0, Claude Code 2.1.319, Gemini CLI 0.67.0 (flags and errors) and OpenCode 1.19.5; real-output fixtures in `test/fixtures/real/`; spec `.kiro/specs/m3-real-clis` (Requirement 14). Found and fixed: Codex token count never parsed, Gemini headless trust error, OpenCode usage now reported.
- Still open: a successful Gemini run and a real rate-limit response.
- `stitchwork lab`: a small local web UI in an "operating table" theme with each agent as a limb, live quota gauges, recent runs and a skill launcher. This is the Design score.
- Optional quota import from local CLI usage files, so usage made outside the gateway counts.
- Build this milestone's spec (`.kiro/specs/lab-dashboard/`) inside Kiro from the first prompt, and keep screenshots.

## M4 — Kiro showcase and submission (target 2026-12-01)
- Finish `docs/KIRO_USAGE.md` from real Kiro sessions (every ✍️ section).
- Record the video from `docs/DEMO_SCRIPT.md`, upload to YouTube as Public.
- Optional bonuses: blog post mentioning Kiroween 2026; a post starting with #KiroweenHackathon26; Best Student Project details.
- Kiro credit request by 2026-12-01 12:00 PT.
- Final Devpost submission by 2026-12-03 (one day of buffer).
