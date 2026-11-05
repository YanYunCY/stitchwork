---
inclusion: always
---

# Tech stack and constraints

## Runtime
- Node.js **22.18+**, ESM only (`"type": "module"`).
- TypeScript executed directly through Node's built-in type stripping. No bundler, no build step for running or testing.
  - Use only erasable syntax: no `enum`, no `namespace`, no parameter properties, no decorators.
  - Relative imports always include the `.ts` extension.
  - Type-only imports use `import type`.
- `tsc --noEmit` (TypeScript 5.9, `strict: true`) is the type checker; it must pass before every commit.

## Dependencies
- **Zero runtime dependencies.** The MCP protocol (JSON-RPC 2.0 over newline-delimited stdio) is implemented in `src/mcp/`.
- Dev dependencies allowed: `typescript`, `@types/node`, `fast-check`.

## Testing
- `node --test` with `node:assert/strict`. Test files live in `test/` and end in `.test.ts`.
- Property-based tests (fast-check) for invariants of the quota ledger and router.
- Never spawn a real agent CLI in tests: inject a fake `spawn` function.
- `npm test` must be green before a task in `tasks.md` is marked done.

## MCP
- Protocol version `2025-06-18`; also accept `2025-03-26` and `2024-11-05` from clients.
- Implement `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`.
- Tool failures are returned as `{ isError: true, content: [...] }`, not JSON-RPC errors. JSON-RPC errors are reserved for protocol problems (unknown method, bad params).
- stdout is reserved for protocol frames; all logs go to stderr.

## Secrets
- Read API keys only from `process.env`. Never log, persist, or echo them. Child processes inherit the environment.

## Agent CLIs (non-interactive invocations)
| Agent | Command |
| --- | --- |
| Codex CLI | `codex exec --skip-git-repo-check <prompt>` |
| Claude Code | `claude -p <prompt> --output-format json` |
| Gemini CLI | `gemini -p <prompt> --output-format json` |
| OpenCode | `opencode run <prompt>` |
Flags can be extended per agent with `extraArgs` in config.
