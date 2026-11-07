# How Kiro is used in Stitchwork

> **Draft.** Sections marked ✍️ must be written from real Kiro sessions, with screenshots, before submission. Everything else describes files that exist in this repo today. Nothing here should claim a Kiro session that did not happen.

## At a glance

| Kiro feature | Where | What it does for this project |
| --- | --- | --- |
| Spec-driven development | `.kiro/specs/mvp-gateway/`, `.kiro/specs/m2-demo-ready/` | 13 EARS requirements, design with correctness properties P1–P6, task lists whose ids appear in commit messages |
| Steering | `.kiro/steering/{product,tech,structure}.md` | Pins the product scope, the zero-dependency TypeScript rules and the one-file-per-concept layout |
| Agent hooks | `.kiro/hooks/*.kiro.hook` (4) | Tests on save, adapter checklist, spec sync, ledger privacy guard |
| MCP | `.kiro/settings/mcp.json` | Registers Stitchwork itself, so Kiro can hand sub-tasks to Codex, Claude Code, Gemini CLI or OpenCode |
| Property-based testing | `test/ledger.test.ts`, `test/router.test.ts`, `test/cooldown.test.ts`, `test/failover.test.ts` | fast-check properties P1–P6 straight from the design docs |

## Spec-driven development

Two specs, each with `requirements.md` (EARS: `WHEN`, `WHILE`, `IF … THEN`, `WHERE`), `design.md` and `tasks.md`.

- **`mvp-gateway`** (Requirements 1–7): unified agent interface, MCP server, shared quota ledger, router, skills, configuration and secrets, CLI. Design defines invariants P1–P4.
- **`m2-demo-ready`** (Requirements 8–13, numbering continues on purpose): rate-limit failover with a persisted cooldown, progress notifications, cancellation, `doctor`, a self-contained `demo`, and an installable build. Design adds P5 (cooldown) and P6 (failover bound).

Every commit names its task, e.g. `feat(gateway): rate-limit failover, progress events and cancellation with property P6 (task M2.5)`, so `git log` reads as the task list being worked through.

✍️ *How the spec was produced and refined in Kiro (requirements → design → tasks), what Kiro changed or caught, and how it compared to vibe coding. Screenshot of the spec view with tasks ticking.*

## Steering

- `product.md`: who it is for, the problems it solves, and principles such as "gateway, not a new agent", "check before you spend" and "secrets stay in the environment".
- `tech.md`: Node 22.18+ native type stripping, erasable-only TypeScript, `.ts` import extensions, zero runtime dependencies, injectable `spawn`/`now`/store for testability, and why a build exists only for publishing.
- `structure.md`: file map and the rule that nothing outside `src/adapters/` may branch on an agent id.

✍️ *A concrete moment where steering changed Kiro's output (for example, Kiro reaching for an `enum` or a runtime dependency and steering pulling it back).*

## Agent hooks

| Hook | Trigger | Action |
| --- | --- | --- |
| `test-on-save` | `src/**/*.ts`, `test/**/*.ts` edited | Run typecheck and tests; fix before continuing; never tick a task while red |
| `new-adapter-checklist` | `src/adapters/*.ts` created | Registry entry, tests, docs, no id branching in core |
| `spec-sync` | any `requirements.md` edited | List acceptance criteria not covered by design or tasks |
| `ledger-privacy` | ledger, gateway or demo edited | Confirm the ledger still stores counts only (Req 3.8, 6.4) |

✍️ *Screenshots of each hook firing, and one case where a hook caught something.*

## MCP

`.kiro/settings/mcp.json` runs `node src/cli.ts serve`, so inside Kiro the gateway's five tools are available (`agents_list`, `quota_status` and `skills_list` are auto-approved). Kiro can then ask Stitchwork to run the `code-review` skill on Claude or Codex, or to explain a file with Gemini, while the shared ledger keeps count.

✍️ *Screenshot of Kiro calling `skill_run` through Stitchwork, and of `quota_status` after a few calls.*

## Property-based testing

| Property | Requirement | Test |
| --- | --- | --- |
| P1 window sum equals the brute-force sum | 3.4 | `test/ledger.test.ts` |
| P2 headroom stays in [0, 1] and never rises when usage is added | 3.4 | `test/ledger.test.ts` |
| P3 exhausted iff a limit is reached | 3.5 | `test/ledger.test.ts` |
| P4 router never picks an exhausted, disabled or missing agent | 4.x | `test/router.test.ts` |
| P5 cooldown end is the max cooldown covering now | 8.2 | `test/cooldown.test.ts` |
| P6 at most 1 + maxFallbacks attempts, no agent twice | 8.3, 8.4 | `test/failover.test.ts` |

✍️ *Any case where a property found a bug that unit tests missed.*

## Pre-existing code disclosure

None. The repository started on 2026-11-05, after the submission period opened (2026-10-30 09:00 PT). No code was copied from the author's earlier projects. Development tooling: TypeScript and fast-check (dev dependencies only).

✍️ *Disclose any other AI tools used alongside Kiro and for which parts.*
