# How Kiro was used (draft — to be completed from real Kiro sessions)

> Judges score "Technological Implementation" on how deeply Kiro was used. Fill each section with what actually happened in Kiro, with screenshots. Do not claim anything that did not happen.

## Spec-driven development
- `.kiro/specs/mvp-gateway/` — requirements in EARS (7 requirements, ~45 acceptance criteria), design with invariants P1–P4, and a task list whose ids appear in every commit message.
- TODO: describe running the next spec (`lab-dashboard`) through Kiro's requirements → design → tasks flow, and how it compared to vibe coding.

## Steering docs
- `product.md`, `tech.md`, `structure.md` (all `inclusion: always`). The biggest win so far: `tech.md` forces erasable-only TypeScript and `.ts` import extensions, which keeps Kiro's output runnable by Node's native type stripping with no build step.
- TODO: note a concrete case where steering changed Kiro's answer.

## Agent hooks
- `test-on-save` (fileEdited `src/**/*.ts`, `test/**/*.ts`): typecheck + tests, fix before continuing.
- `new-adapter-checklist` (fileCreated `src/adapters/*.ts`): registration, tests, docs, no id branching in core.
- `spec-sync` (fileEdited `requirements.md`): every acceptance criterion is covered by design and tasks.
- TODO: screenshots of each hook firing.

## MCP
- `.kiro/settings/mcp.json` registers Stitchwork itself, so Kiro can delegate sub-tasks to Codex, Claude Code, Gemini CLI or OpenCode through the gateway (dogfooding).

## Property-based testing
- fast-check properties for the ledger (P1 window sum, P2 headroom bounds and monotonicity, P3 exhaustion) and the router (P4 never picks an exhausted/disabled/missing agent).
- TODO: record any bug PBT caught.

## Pre-existing code disclosure
- None. Repository started 2026-11-05, after the submission period opened (2026-10-30). No code copied from the author's earlier projects.
