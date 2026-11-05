# Design: MVP gateway

## Overview
```
 MCP client (Kiro, Claude Desktop, …)
        │  JSON-RPC 2.0 over stdio
        ▼
 ┌──────────────── mcp/server.ts ────────────────┐
 │ initialize · tools/list · tools/call · ping    │
 └──────────────────────┬─────────────────────────┘
                        ▼
                  gateway.ts  ◄── config.ts
            ┌─────────┼───────────┬──────────────┐
            ▼         ▼           ▼              ▼
       skills/    router.ts   quota/ledger.ts  adapters/*
                      │            ▲              │
                      └──► runner.ts (spawn) ─────┘
                                │
              codex · claude · gemini · opencode CLIs
```

## Components

### `types.ts`
```ts
type AgentId = 'codex' | 'claude' | 'gemini' | 'opencode';
interface Usage { inputTokens: number; outputTokens: number; totalTokens: number; estimated: boolean }
interface RunResult { agent: AgentId; ok: boolean; output: string; usage: Usage; durationMs: number; exitCode: number | null }
```

### Adapters (`adapters/<id>.ts`)
```ts
interface AgentAdapter {
  id: AgentId; displayName: string; defaultBinary: string;
  buildArgs(prompt: string, extraArgs: string[]): string[];
  parse(stdout: string, stderr: string, prompt: string): { output: string; usage: Usage };
}
```
- **claude**: `-p <prompt> --output-format json`; parses `{ result, usage: { input_tokens, output_tokens, cache_* } }`.
- **gemini**: `-p <prompt> --output-format json`; parses `{ response, stats.models.*.tokens.{prompt,candidates,total} }`.
- **codex**: `exec --skip-git-repo-check <prompt>`; output is plain text, parses a trailing `tokens used: N` line when present.
- **opencode**: `run <prompt>`; plain text, always estimated.
- Shared helper `estimateUsage(prompt, output)` → `ceil(len/4)` each side, `estimated: true` (Req 1.4).
The prompt is passed as a single argv element, never through a shell, so no quoting or injection issues.

### Runner (`runner.ts`)
`runProcess({ binary, args, cwd, timeoutMs, env }, spawnFn)` returns `{ stdout, stderr, exitCode, timedOut, notFound, durationMs }`. Uses `child_process.spawn` with `shell: false`, `stdin` closed. On timeout sends SIGTERM then SIGKILL after 2 s (Req 1.6). `ENOENT` maps to `notFound` (Req 1.7). Output is capped at 1 MiB per stream.

### Quota ledger (`quota/ledger.ts`)
- `UsageEvent = { ts: number; agent: AgentId; tokens: number; ok: boolean; estimated: boolean }` — no prompt or output fields (Req 3.8).
- `QuotaLedger(limits, windowMs, store)`; `store` is `{ load(): string[]; append(line): void }` so tests use memory and prod uses a file.
- `snapshot(agent, now)` → `{ usedTokens, usedRequests, tokenLimit, requestLimit, headroom, exhausted, resetsAt }`.
  - `headroom = min(1 - used/limit)` over limited dimensions, clamped to `[0,1]`; unlimited dimensions count as `1` (Req 3.7).
  - `exhausted = used >= limit` on any limited dimension.
  - `resetsAt = oldest counted event ts + windowMs`.
- Events older than the window are pruned from memory on each record but kept on disk.

**Invariants (property-tested)**
- P1: Used tokens in a snapshot equals the sum of tokens of events with `ts > now - window`.
- P2: Headroom is always within `[0,1]` and is monotonically non-increasing as events are added at a fixed `now`.
- P3: `exhausted` is true iff some limited dimension has `used >= limit`.

### Router (`router.ts`)
`choose({ requested, preferred }, ctx)` → `{ ok: true, agent } | { ok: false, reason }`.
- Explicit: refuse if disabled (4.4) or exhausted (3.5); otherwise return it even if the binary is missing (the run reports 1.7).
- Auto: candidates = `preferred ?? all agents`, filtered by enabled, available, not exhausted; sort by headroom desc, then candidate order. Empty → reason lists each skip (4.3).
- Property: the chosen agent is never exhausted (P4, Req 4.5).

### Skills (`skills/`)
- Minimal front matter parser (`key: value`, `key: [a, b]`, and `- item` lists). No YAML dependency.
- `render(skill, input)` replaces all `{{input}}` (whitespace-tolerant) (5.3).
- Registry loads files sorted by name; duplicates and invalid files produce warnings (5.4, 5.5).

### Gateway (`gateway.ts`)
Owns config, adapters, ledger, skills, and an `isAvailable(binary)` probe (PATH lookup, cached). `run({ agent, prompt, skill?, input?, cwd? })`:
1. Resolve prompt (skill render if given).
2. Router chooses agent.
3. Runner executes adapter args.
4. Adapter parses usage; ledger records event.
5. Return `RunResult` plus `routedBy: 'explicit' | 'auto'`.

### MCP server (`mcp/`)
- `jsonrpc.ts`: line splitter + `success/error` helpers.
- `server.ts`: `createServer(gateway, { input, output, log })`; handles `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`; validates required args against each tool's schema `required` list.
- `tools.ts`: tool definitions (name, description, inputSchema) and handlers that format results as text.

### Config (`config.ts`)
`loadConfig(path?, readFile)` merges `stitchwork.config.json` over defaults and validates types with explicit field paths in error messages (6.2).

## Error handling
| Situation | Behaviour |
| --- | --- |
| Agent exhausted / disabled / none eligible | Tool result `isError: true`, human-readable reason |
| CLI non-zero exit | `ok: false`, stderr tail (last 2 KB) |
| Timeout | child killed, `ok: false`, "timed out after Ns" |
| Binary missing | `ok: false`, "binary `x` not found on PATH" |
| Bad JSON on stdin | `-32700`, keep serving |
| Ledger line malformed | skipped on load |

## Testing strategy
- Unit tests per module with injected `spawn`, `now`, and stores.
- fast-check properties P1–P4.
- An end-to-end MCP test drives the server through in-memory streams with a fake spawn that emits Claude-style JSON.

## Security
- `shell: false`; prompt is one argv element.
- Environment passed through untouched; never serialized.
- Ledger stores counts only.
