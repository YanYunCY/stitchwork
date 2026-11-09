# How Kiro is used in Stitchwork

> Everything below describes files in this repo or Kiro sessions that actually happened. Session transcripts are in [`docs/kiro/`](kiro/). Who did what is spelled out under *Disclosure* at the end.

## At a glance

| Kiro feature | Where | What it does for this project |
| --- | --- | --- |
| Spec-driven development | `.kiro/specs/mvp-gateway/`, `.kiro/specs/m2-demo-ready/`, `.kiro/specs/m3-real-clis/`, `.kiro/specs/m3-lab/` | 19 EARS requirements, designs with correctness properties P1–P12, task lists whose ids appear in commit messages |
| Steering | `.kiro/steering/{product,tech,structure}.md` | Pins the product scope, the zero-dependency TypeScript rules and the one-file-per-concept layout |
| Agent hooks | `.kiro/hooks/*.kiro.hook` (4) | Tests on save, adapter checklist, spec sync, ledger privacy guard |
| MCP | `.kiro/settings/mcp.json` | Registers Stitchwork itself, so Kiro can hand sub-tasks to Codex, Claude Code, Gemini CLI or OpenCode |
| Property-based testing | `test/ledger.test.ts`, `test/router.test.ts`, `test/cooldown.test.ts`, `test/failover.test.ts`, `test/ledger-fields.test.ts`, `test/lab-*.test.ts` | fast-check properties P1–P12 straight from the design docs |

## Spec-driven development

Four specs, each with `requirements.md` (EARS: `WHEN`, `WHILE`, `IF … THEN`, `WHERE`), `design.md` and `tasks.md`.

- **`mvp-gateway`** (Requirements 1–7): unified agent interface, MCP server, shared quota ledger, router, skills, configuration and secrets, CLI. Design defines invariants P1–P4.
- **`m2-demo-ready`** (Requirements 8–13, numbering continues on purpose): rate-limit failover with a persisted cooldown, progress notifications, cancellation, `doctor`, a self-contained `demo`, and an installable build. Design adds P5 (cooldown) and P6 (failover bound).
- **`m3-real-clis`** (Requirement 14): what changed after running each real CLI, with the raw output kept as test fixtures.
- **`m3-lab`** (Requirements 15–19): the `stitchwork lab` dashboard: a loopback-only server with Host and Origin guards, live per-agent gauges, recent runs read from the ledger, and a single-flight skill launcher that is read-only until the user clicks Run. Design adds P7 (recent runs), P8 (ledger round trip and privacy), P9 (host and origin guard), P10 (read-only), P11 (single launch) and P12 (gauge fill).

Every commit names its task, e.g. `feat(gateway): rate-limit failover, progress events and cancellation with property P6 (task M2.5)`, so `git log` reads as the task list being worked through.

### The `m3-lab` session (Kiro CLI 3.1.0, model `auto`, 2026-11-09)

The lab dashboard was built in Kiro, spec first ([transcripts](kiro/)):

1. **Spec** ([01-spec.log](kiro/01-spec.log)). Kiro was given one paragraph describing `stitchwork lab` and told to follow the existing specs and steering. It read the three earlier specs, the steering files and the gateway and ledger code before writing anything, then produced Requirements 15–19, design properties P7–P12 and a 10-task list. It also caught a gap in the ask: the run list needed duration and fallbacks, which the ledger never recorded, so it added Requirement 17.2 and made the ledger change task 1, keeping the fields as counts so Requirement 3.8 (no prompt text in the ledger) still holds. Cost: about 2.4 credits.
2. **Implementation** ([02-implement.log](kiro/02-implement.log)). Kiro worked through the tasks in order, running `npm run typecheck && npm test` after each, and ticked them in `tasks.md`. It reported where it departed from the spec and why: `--open` and `--read-only` swallowed the next argument in `parseArgs`, so it introduced a boolean-flag list; `examples/demo.config.json` would have launched real CLIs from the lab, so it pointed it at the fake agents and taught `mergeConfig` to resolve relative binary paths; `/api/state` drops binary paths so the page never shows local paths. The test suite went from 128 to 195 passing tests. Total for both steps: about 27.5 credits.

Compared with the earlier milestones, which were written outside Kiro in Kiro's spec format, the difference was that Kiro went and checked the code against the request before writing requirements, which is how the ledger gap surfaced before any code existed.

## Steering

- `product.md`: who it is for, the problems it solves, and principles such as "gateway, not a new agent", "check before you spend" and "secrets stay in the environment".
- `tech.md`: Node 22.18+ native type stripping, erasable-only TypeScript, `.ts` import extensions, zero runtime dependencies, injectable `spawn`/`now`/store for testability, and why a build exists only for publishing.
- `structure.md`: file map and the rule that nothing outside `src/adapters/` may branch on an agent id.

In the lab session Kiro read `tech.md` and `structure.md` first, and the result follows them: the server is plain `node:http` with no runtime dependency, the page's HTML, CSS and JS are TypeScript string modules rather than a bundler step, and new code lives in one-concept files under `src/lab/`. Kiro also updated `structure.md` and `product.md` itself so the steering stays true after the change. The prompt also said zero dependencies, so this shows Kiro following steering rather than steering correcting it.

## Agent hooks

| Hook | Trigger | Action |
| --- | --- | --- |
| `test-on-save` | `src/**/*.ts`, `test/**/*.ts` edited | Run typecheck and tests; fix before continuing; never tick a task while red |
| `new-adapter-checklist` | `src/adapters/*.ts` created | Registry entry, tests, docs, no id branching in core |
| `spec-sync` | any `requirements.md` edited | List acceptance criteria not covered by design or tasks |
| `ledger-privacy` | ledger, gateway or demo edited | Confirm the ledger still stores counts only (Req 3.8, 6.4) |

The hooks above are Kiro IDE hooks. The lab was built with Kiro CLI, which does not run IDE `.kiro.hook` files, so these hooks have not fired in a Kiro session yet. In the CLI session the same rule was given as an instruction (typecheck and test after every task), and that run caught a race in the page script: a late `/api/launch/status` reply could overwrite the final result. A fake-DOM test exposed it and Kiro guarded it.

## MCP

`.kiro/settings/mcp.json` runs `node src/cli.ts serve`, so inside Kiro the gateway's five tools are available (`agents_list`, `quota_status` and `skills_list` are auto-approved). Kiro can then ask Stitchwork to run the `code-review` skill on Claude or Codex, or to explain a file with Gemini, while the shared ledger keeps count.

Verified from Kiro CLI ([03-mcp.log](kiro/03-mcp.log)): Kiro loaded the server from `.kiro/settings/mcp.json`, called `@stitchwork/agents_list`, `@stitchwork/skills_list` and `@stitchwork/quota_status` in parallel, and summarised each agent's state and which skills prefer it. `skill_run` was not called in that session because the sandbox had none of the four vendor CLIs installed.

## Property-based testing

| Property | Requirement | Test |
| --- | --- | --- |
| P1 window sum equals the brute-force sum | 3.4 | `test/ledger.test.ts` |
| P2 headroom stays in [0, 1] and never rises when usage is added | 3.4 | `test/ledger.test.ts` |
| P3 exhausted iff a limit is reached | 3.5 | `test/ledger.test.ts` |
| P4 router never picks an exhausted, disabled or missing agent | 4.x | `test/router.test.ts` |
| P5 cooldown end is the max cooldown covering now | 8.2 | `test/cooldown.test.ts` |
| P6 at most 1 + maxFallbacks attempts, no agent twice | 8.3, 8.4 | `test/failover.test.ts` |
| P7 recent runs: newest first, last 20 valid events, garbage ignored | 17.1, 17.3 | `test/lab-runs.test.ts` |
| P8 ledger round trip with `durationMs` and `fallbacks`, no extra keys | 17.2, 17.5 | `test/ledger-fields.test.ts` |
| P9 host and origin allowed iff exactly the loopback forms | 15.5, 19.4 | `test/lab-guard.test.ts` |
| P10 no ledger writes or gateway runs without an accepted launch; 405 elsewhere | 19.1, 19.2 | `test/lab-server.test.ts` |
| P11 of n concurrent launches exactly one runs, n−1 get 409 | 18.4 | `test/lab-launch.test.ts` |
| P12 gauge fill in [0, 1], non-increasing in usage, null without a limit | 16.3 | `test/lab-runs.test.ts` |

No property has caught a bug that example-based tests missed so far; their value here has been pinning the design's invariants so the lab change to the ledger (P8) could not quietly break the earlier ones (P1–P3).

## Pre-existing code disclosure

None. The repository started on 2026-11-05, after the submission period opened (2026-10-30 09:00 PT). No code was copied from the author's earlier projects. Development tooling: TypeScript and fast-check (dev dependencies only).

## Disclosure: other AI tools

- **M1–M3a** (gateway, failover, demo, real-CLI verification) and the specs, steering and hooks for those milestones were drafted by an AI coding assistant (Hark) in Kiro's spec format, at the author's direction, before the author had Kiro access.
- **M3b `stitchwork lab`** was specified and implemented by Kiro (Kiro CLI on the author's Kiro account). The Kiro CLI sessions were driven by the same assistant on the author's behalf; the prompts are in the transcripts.
- The four adapters were checked against the real Codex, Claude Code, Gemini CLI and OpenCode CLIs; those runs used OpenAI and DeepSeek API keys.
