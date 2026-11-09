---
inclusion: always
---

# Project structure

```
.kiro/
  steering/        product, tech, structure (always included)
  specs/           one folder per feature: requirements.md (EARS), design.md, tasks.md
  hooks/           agent hooks (*.kiro.hook)
  settings/        mcp.json for using Stitchwork from inside Kiro
src/
  types.ts         shared types (AgentId, RunRequest, RunResult, Usage, ...)
  config.ts        load + validate stitchwork.config.json, apply defaults
  adapters/        one file per agent limb + index.ts registry
  runner.ts        spawn a CLI with timeout, capture stdout/stderr (spawn is injectable)
  quota/ledger.ts  rolling-window, append-only JSONL usage ledger
  router.ts        choose an agent (explicit or auto), enforce quota and rate-limit cooldown
  ratelimit.ts     vendor-agnostic rate-limit signature detection
  skills/          skill file parser + registry
  gateway.ts       ties config, adapters, ledger, router, skills together; failover loop
  doctor.ts        `stitchwork doctor` health check
  demo.ts          `stitchwork demo` scripted scenario on the bundled stand-in agents
  mcp/             JSON-RPC framing + MCP server and tool definitions
  lab/             `stitchwork lab`: loopback HTTP server, guard, read-only API, launcher, page (inline CSS+JS)
  cli.ts           `stitchwork` entry point
skills/            built-in reusable skills (*.md)
examples/          fake-agents/ stand-in CLIs (honour STITCHWORK_FAKE_RATE_LIMIT) + demo config
dist/              build output (gitignored), produced by `npm run build`
test/              node:test suites, *.test.ts
docs/              milestones, demo script, Kiro usage write-up
```

## Conventions
- One concept per file; files stay under ~200 lines.
- Adding an agent = add `src/adapters/<id>.ts`, register it in `src/adapters/index.ts`, add tests. Nothing else in `src/` may branch on an agent id.
- Pure logic (parsing, routing, quota math) takes `now`/`spawn`/`fs` as parameters so it is testable without mocks of globals.
- Commit messages follow Conventional Commits and reference the task id from `tasks.md`, e.g. `feat(quota): rolling window ledger (task 4)`.
