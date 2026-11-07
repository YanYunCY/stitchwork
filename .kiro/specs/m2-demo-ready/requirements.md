# Requirements: M2 — demo-ready gateway

## Introduction
M2 turns the MVP into something a judge can install and watch working end to end. It adds the behaviour that makes a multi-agent gateway worth having over calling one CLI directly: automatic failover when a vendor rate-limits you, live progress and cancellation over MCP, a health check for the real CLIs, a self-contained demo, and an installable build. Requirements use EARS notation. Numbering continues from the MVP spec (`mvp-gateway`), so these are Requirements 8–13.

## Glossary
- **Rate-limit signature**: text in a failed run's stderr or output matching HTTP 429, "rate limit", "too many requests", "usage limit", "quota exceeded/exhausted" or "RESOURCE_EXHAUSTED" (case-insensitive).
- **Cooldown**: a span (default 15 minutes) after a rate-limited run during which the router treats that agent as unavailable.
- **Fallback**: re-running the same prompt on the next eligible agent after a rate-limited auto-routed run.

---

### Requirement 8: Rate-limit failover
**User story:** As a developer juggling several subscriptions, I want a rate-limited agent to hand my task to another one automatically, so that one vendor's limit does not stop my work.

**Acceptance criteria**
8.1 WHEN a run fails AND its stderr or output matches the rate-limit signature, the gateway SHALL record the usage event with `rateLimited: true` in the ledger.
8.2 WHILE an agent has a `rateLimited` event newer than `cooldownMinutes` (default 15), the ledger snapshot SHALL report `coolingUntil` as that event's time plus the cooldown, and the router SHALL skip the agent in auto mode with the reason `rate-limited, cooling down`.
8.3 WHEN an auto-routed run is rate-limited, the gateway SHALL re-route the same prompt to the next eligible agent, up to `maxFallbacks` times (default 2).
8.4 The gateway SHALL include every abandoned attempt in the result as `fallbacks: [{ agent, reason }]`, in order.
8.5 IF the run was explicitly routed, THEN the gateway SHALL NOT fall back, and SHALL return the rate-limited failure as is.
8.6 IF an explicit run targets an agent that is cooling down, THEN the gateway SHALL refuse it with the time the cooldown ends.
8.7 The cooldown SHALL persist across processes because it is derived from the ledger, not from memory.

### Requirement 9: Progress notifications
**User story:** As an MCP client user, I want to see what a long agent run is doing, so that I know it has not hung.

**Acceptance criteria**
9.1 WHEN a `tools/call` request carries `params._meta.progressToken`, the server SHALL send `notifications/progress` frames with that token while the call runs.
9.2 The server SHALL send a progress frame when an agent is chosen, when the agent writes output, when a fallback happens, and when the run finishes.
9.3 Each progress frame SHALL carry a strictly increasing `progress` number and a `message` of at most 200 characters.
9.4 The server SHALL send at most one output progress frame per 250 ms per call.
9.5 IF a request carries no progress token, THEN the server SHALL send no progress frames for it.

### Requirement 10: Cancellation
**User story:** As an MCP client user, I want to cancel a run I no longer need, so that it stops spending my quota.

**Acceptance criteria**
10.1 WHEN the server receives `notifications/cancelled` whose `requestId` matches an in-flight `tools/call`, the server SHALL terminate that call's agent process.
10.2 The server SHALL NOT send a response for a cancelled request.
10.3 The gateway SHALL record a cancelled run in the ledger with `ok: false`.
10.4 IF the `requestId` matches no in-flight request, THEN the server SHALL ignore the notification.

### Requirement 11: Doctor
**User story:** As a new user, I want one command that tells me which agent CLIs Stitchwork can use, so that I can fix my setup before connecting a client.

**Acceptance criteria**
11.1 WHEN the user runs `stitchwork doctor`, the CLI SHALL print, for each agent, its binary, whether it is on PATH, its `--version` output (first line, 5 s timeout), whether it is enabled, and its configured limits.
11.2 The CLI SHALL print a closing line with how many agents are ready, and the MCP config snippet to paste into a client.
11.3 `stitchwork doctor` SHALL exit 0 even when no agent is installed.

### Requirement 12: Self-contained demo
**User story:** As a judge, I want to see the gateway route, refuse and fail over without installing any vendor CLI or spending any tokens.

**Acceptance criteria**
12.1 WHEN the user runs `stitchwork demo`, the CLI SHALL run a scripted scenario against the bundled fake agents in a fresh temporary directory with its own ledger.
12.2 The scenario SHALL show, in order: the agent list, two Claude runs, a third Claude run refused for quota with its reset time, an auto run that routes elsewhere, a rate-limited Gemini run that fails over, and the final quota table.
12.3 The demo SHALL never invoke a real agent CLI, read the user's config, or write to the user's ledger.
12.4 WHERE `--pace <ms>` is given, the demo SHALL pause that long between steps (default 0) so it can be screen-recorded.

### Requirement 13: Installable build
**User story:** As a user, I want `npm i -g` to give me a working `stitchwork` command.

**Acceptance criteria**
13.1 `npm run build` SHALL emit JavaScript for `src/` into `dist/` with relative import extensions rewritten to `.js`.
13.2 The `stitchwork` bin SHALL load `dist/cli.js` when it exists and fall back to `src/cli.ts` otherwise.
13.3 The published package SHALL include `dist/`, `skills/`, `examples/` and the README, and SHALL build on `prepack`.
