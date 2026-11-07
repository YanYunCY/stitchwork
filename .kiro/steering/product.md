---
inclusion: always
---

# Product: Stitchwork

## One-liner
An open-source control plane that stitches Codex CLI, Claude Code, Gemini CLI and OpenCode together behind one MCP-aware gateway, with shared quota tracking across the agents and reusable skills.

## Who it is for
- Developers who pay for two or more coding agents and want one entry point.
- MCP clients (Kiro, Claude Desktop, Cursor, other agents) that want to delegate work to "whichever agent has budget left" without knowing each CLI's flags.

## Problems we solve
1. Four CLIs with four flag dialects and output formats.
2. Quota exhaustion discovered mid-task instead of before dispatch.
3. No shared view of how much each agent has been used today.
4. Good prompts copied by hand between tools instead of reused.

## Principles
- **Gateway, not a new agent.** Stitchwork never reimplements an agent; it wraps the official CLIs and respects their own auth.
- **Check before you spend.** Every run consults the shared ledger first and refuses or reroutes rather than failing late.
- **Boring, inspectable state.** The ledger is append-only JSONL a human can read with `cat`.
- **Secrets stay in the environment.** Nothing sensitive is written to config, logs, or the ledger.
- **Frankenstein, but tidy.** Each adapter is a small, isolated "limb"; the core never special-cases one agent.

## Out of scope for now
- Done in M2: progress notifications, cancellation, rate-limit failover.
- A web dashboard (`stitchwork lab`, milestone 3).
- Remote/HTTP transport and multi-user auth.
- Reading vendor billing APIs for exact quota; Stitchwork tracks what passes through the gateway.

## Tone of docs and UI
Short, direct, lightly Halloween-themed (stitches, limbs, the lab) but never at the cost of clarity.
