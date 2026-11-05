# Requirements: MVP gateway

## Introduction
Stitchwork's MVP exposes four coding-agent CLIs (Codex CLI, Claude Code, Gemini CLI, OpenCode) as one MCP server over stdio, tracks usage across all of them in a shared rolling-window ledger, and runs reusable prompt skills. Requirements use EARS notation (Ubiquitous, Event-driven `WHEN`, State-driven `WHILE`, Unwanted-behaviour `IF … THEN`, Optional `WHERE`).

## Glossary
- **Agent**: one of `codex`, `claude`, `gemini`, `opencode`.
- **Adapter**: the module that knows how to invoke one agent CLI and parse its output.
- **Ledger**: the shared, persisted record of usage events.
- **Window**: the rolling time span (default 300 minutes) over which limits apply.
- **Headroom**: the smallest remaining fraction of an agent's token or request limit in the current window.
- **Skill**: a Markdown file with front matter and a prompt template.

---

### Requirement 1: Unified agent interface
**User story:** As an MCP client, I want one tool that runs a prompt on any supported agent, so that I don't need to know each CLI's flags.

**Acceptance criteria**
1.1 The gateway SHALL provide an adapter for each of `codex`, `claude`, `gemini` and `opencode`.
1.2 WHEN `agent_run` is called with an agent id and a prompt, the gateway SHALL invoke that agent's CLI non-interactively and return its final text output.
1.3 The gateway SHALL return every run result in one shape: `agent`, `ok`, `output`, `usage { inputTokens, outputTokens, totalTokens, estimated }`, `durationMs`, `exitCode`.
1.4 WHEN an adapter cannot parse token usage from the CLI output, the gateway SHALL estimate usage as `ceil(characters / 4)` and set `usage.estimated` to `true`.
1.5 IF the agent CLI exits with a non-zero code, THEN the gateway SHALL return `ok: false` with the stderr tail in `output`.
1.6 IF a run exceeds the configured timeout (default 600 s), THEN the gateway SHALL terminate the child process and return `ok: false` with a timeout message.
1.7 IF the agent's binary is not found, THEN the gateway SHALL return `ok: false` with a message naming the missing binary.
1.8 WHERE `extraArgs` is configured for an agent, the gateway SHALL append those arguments to that agent's invocation.

### Requirement 2: MCP server
**User story:** As a user of Kiro or another MCP client, I want Stitchwork to speak MCP over stdio, so that I can add it as a server with one config entry.

**Acceptance criteria**
2.1 WHEN the server receives `initialize`, it SHALL respond with protocol version `2025-06-18` (or the client's version if it is one of the supported versions), server info, and the `tools` capability.
2.2 WHEN the server receives `tools/list`, it SHALL return `agents_list`, `agent_run`, `skills_list`, `skill_run` and `quota_status`, each with a JSON Schema for its input.
2.3 WHEN the server receives `tools/call` for a known tool, it SHALL return a `content` array containing a text block, and SHALL set `isError: true` when the run failed or was refused.
2.4 IF a request names an unknown method, THEN the server SHALL return JSON-RPC error `-32601`.
2.5 IF a `tools/call` names an unknown tool or omits a required argument, THEN the server SHALL return JSON-RPC error `-32602`.
2.6 IF a line on stdin is not valid JSON, THEN the server SHALL return JSON-RPC error `-32700` and continue serving.
2.7 The server SHALL write only protocol messages to stdout and all diagnostics to stderr.
2.8 WHEN the server receives a notification (a message without `id`), it SHALL NOT send a response.

### Requirement 3: Shared quota tracking
**User story:** As a developer paying for several agents, I want one ledger of usage across all of them, so that I know what budget is left before I dispatch work.

**Acceptance criteria**
3.1 WHEN a run completes, the gateway SHALL append one usage event (timestamp, agent, tokens, ok, estimated flag) to the ledger.
3.2 The ledger SHALL persist events as append-only JSONL at the configured `ledgerPath`.
3.3 WHEN the gateway starts, it SHALL load existing ledger events and ignore malformed lines.
3.4 The ledger SHALL compute each agent's used tokens and requests from events inside the current window only.
3.5 WHILE an agent's used tokens or requests are at or above its configured limit, the gateway SHALL refuse explicit runs on that agent with a message stating when the oldest counted event leaves the window.
3.6 WHEN `quota_status` is called, the gateway SHALL report, per agent, used and limit for tokens and requests, headroom, and whether the agent is exhausted.
3.7 WHERE no limit is configured for an agent, the ledger SHALL treat that dimension as unlimited.
3.8 The ledger SHALL NOT record prompts, outputs, or any secret values.

### Requirement 4: Routing
**User story:** As an MCP client, I want to say "auto" and have the healthiest agent chosen, so that work keeps flowing when one agent runs dry.

**Acceptance criteria**
4.1 WHEN `agent` is `auto`, the router SHALL choose, among enabled agents whose binary is available and which are not exhausted, the one with the greatest headroom.
4.2 WHERE a skill declares preferred `agents`, the router SHALL consider only those agents for `auto`, in the declared order as a tiebreaker.
4.3 IF no agent is eligible, THEN the router SHALL refuse the run with a message listing why each agent was skipped.
4.4 IF an explicitly named agent is disabled in config, THEN the router SHALL refuse the run.
4.5 The router SHALL never choose an exhausted agent.

### Requirement 5: Reusable skills
**User story:** As a developer, I want to save prompts as skill files, so that any agent can run them through the gateway.

**Acceptance criteria**
5.1 WHEN the gateway starts, it SHALL load every `*.md` file in the skills directory as a skill.
5.2 A skill file SHALL have front matter with `name` and `description`, and MAY declare `agents` (list) and `timeoutSeconds`.
5.3 WHEN `skill_run` is called, the gateway SHALL replace every `{{input}}` in the skill body with the provided input and run the result through the router.
5.4 IF a skill file lacks `name` or `description`, THEN the gateway SHALL skip it and report the reason on stderr.
5.5 IF two skill files declare the same name, THEN the gateway SHALL keep the first by filename order and warn on stderr.
5.6 WHEN `skills_list` is called, the gateway SHALL return each skill's name, description, and preferred agents.

### Requirement 6: Configuration and secrets
**User story:** As an operator, I want simple config with safe defaults, so that it works out of the box and never leaks keys.

**Acceptance criteria**
6.1 WHERE no config file exists, the gateway SHALL run with all four agents enabled, no limits, a 300-minute window, ledger at `.stitchwork/ledger.jsonl`, and skills from `./skills`.
6.2 IF the config file is not valid JSON or has values of the wrong type, THEN the gateway SHALL exit with an error naming the offending field.
6.3 The gateway SHALL read API keys only from environment variables and pass the environment through to child processes.
6.4 The gateway SHALL NOT write environment variable values to the ledger, stdout, or stderr.

### Requirement 7: Command-line interface
**User story:** As a developer, I want a CLI for quick checks, so that I can see agents and quota without an MCP client.

**Acceptance criteria**
7.1 WHEN run as `stitchwork serve`, the CLI SHALL start the MCP server on stdio.
7.2 WHEN run as `stitchwork agents`, `quota` or `skills`, the CLI SHALL print the same data as the matching MCP tool as a readable table.
7.3 WHEN run as `stitchwork run [--agent <id|auto>] [--skill <name>] <prompt>`, the CLI SHALL execute through the same gateway and print the output.
7.4 IF the command is unknown, THEN the CLI SHALL print usage and exit with code 2.
