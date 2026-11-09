# Requirements: M3 — the lab (`stitchwork lab`)

## Introduction
`stitchwork lab` serves a small local web dashboard styled as a Frankenstein operating table. Each agent is a stitched limb with a live quota gauge, the last runs from the ledger sit on a tray, and a skill launcher runs a skill through the existing gateway. It is read-only unless the user explicitly clicks to run a skill. Requirements use EARS notation. Numbering continues from `m3-real-clis`, so these are Requirements 15–19.

## Glossary
- **Lab**: the HTTP server started by `stitchwork lab` and the single page it serves.
- **Limb**: one agent's card on the table: name, install state, gauge, cooldown.
- **Run row**: one ledger event shown in the recent-runs list. One row per attempt, so an abandoned (rate-limited) attempt and the attempt that took over are separate rows.
- **Launch**: a `POST /api/launch` that runs a skill through `Gateway.run`.

---

### Requirement 15: Local-only server
**User story:** As a developer, I want the lab to be reachable only from my own machine, so that nobody else on the network can read my usage or spend my quota.

**Acceptance criteria**
15.1 WHEN the user runs `stitchwork lab [--port <n>] [--open]`, the CLI SHALL start an HTTP server on `127.0.0.1` (default port 7777; `--port 0` picks a free port), print its URL to stdout, and keep running until interrupted.
15.2 The lab SHALL use only `node:http` and SHALL add no runtime dependency.
15.3 IF the port is already in use, THEN the CLI SHALL print the reason to stderr and exit 1.
15.4 The lab SHALL NOT bind to any address other than `127.0.0.1`, and SHALL NOT accept a `--host` option.
15.5 IF a request's `Host` header is not `127.0.0.1:<port>` or `localhost:<port>`, THEN the lab SHALL answer 403 (guards against DNS rebinding).
15.6 The lab SHALL serve its page as a single self-contained HTML document with inline CSS and JS, and SHALL load no remote fonts, scripts or images.

### Requirement 16: Limbs and live gauges
**User story:** As a developer, I want to see at a glance how much each agent has left, so that I know where my next task will go.

**Acceptance criteria**
16.1 `GET /api/state` SHALL return, per agent: id, display name, enabled, available, and the quota snapshot (used and limit for tokens and requests, `headroom`, `exhausted`, `resetsAt`, `coolingUntil`), plus the server time `now`.
16.2 The page SHALL show one limb per agent with a gauge for tokens and a gauge for requests, the headroom as a percentage, and the reset time.
16.3 WHERE a dimension has no limit, the gauge SHALL read `unlimited` and show no fill.
16.4 WHILE an agent is cooling down, its limb SHALL show a cooldown badge with the time remaining; WHILE it is exhausted, its limb SHALL show an exhausted state.
16.5 WHILE the page is open, it SHALL refresh state every 2 seconds without a full reload, and SHALL show a visible "disconnected" state if three consecutive refreshes fail.
16.6 WHILE an agent is disabled or not installed, its limb SHALL be shown dimmed with the reason, and SHALL remain visible.

### Requirement 17: Recent runs
**User story:** As a developer, I want to see what the gateway did lately, so that I can tell where my tokens went and when failover happened.

**Acceptance criteria**
17.1 `GET /api/runs` SHALL return the 20 most recent ledger events, newest first, each with `ts`, `agent`, `ok`, `tokens`, `estimated`, `durationMs`, `fallbacks` and `rateLimited`.
17.2 To support 17.1, the gateway SHALL record `durationMs` (integer milliseconds) and `fallbacks` (the number of attempts abandoned earlier in the same request) on each new usage event, writing each field only when it is available and, for `fallbacks`, greater than 0. Older ledger lines without these fields SHALL stay valid and be shown with `—`.
17.3 `GET /api/runs` SHALL read events from the ledger file rather than the in-memory window, so runs older than `windowMinutes` still appear.
17.4 The page SHALL show each run row with agent, an ok/failed mark, tokens (marked `~` when estimated), duration, and a fallback marker when `fallbacks > 0` or `rateLimited` is set.
17.5 No run row, API response or page text SHALL contain a prompt, an agent output or an environment value, because the ledger holds none (Req 3.8).

### Requirement 18: Skill launcher
**User story:** As a developer, I want to run one of my skills from the lab, so that I can use the table without leaving the browser.

**Acceptance criteria**
18.1 `GET /api/skills` SHALL return each skill's name, description and preferred agents.
18.2 The page SHALL list the skills and, for the selected skill, an input box and a "Run" button; nothing SHALL run until the user clicks that button.
18.3 WHEN the user clicks Run, the page SHALL `POST /api/launch` with `{ skill, input, agent }` (agent defaults to `auto`), and the lab SHALL call `Gateway.run` with exactly those fields, so routing, quota checks and failover behave as for MCP and CLI runs.
18.4 WHILE a launch is in flight, the page SHALL disable the Run button and show the agent it was routed to as soon as it is known; the lab SHALL allow at most one launch at a time and answer a second one with 409.
18.5 WHEN a launch ends, the page SHALL show the output, the agent used, tokens, duration, and any fallbacks, or the refusal reason.
18.6 The page SHALL offer a Cancel button during a launch; WHEN it is clicked, or the browser disconnects, the lab SHALL abort the run through the gateway's `AbortSignal`.
18.7 IF the body is not JSON, is larger than 64 KiB, names an unknown skill, or `agent` is not an agent id or `auto`, THEN the lab SHALL answer 400 and SHALL NOT call the gateway.

### Requirement 19: Read-only by default
**User story:** As a developer, I want the lab to be safe to leave open, so that opening a tab can never spend quota or change state.

**Acceptance criteria**
19.1 Every route except `POST /api/launch` and `POST /api/launch/cancel` SHALL accept only `GET` and answer other methods with 405.
19.2 The lab SHALL NOT write the config, the skills or the ledger except through a launch that the user started.
19.3 WHERE the lab is started with `--read-only`, `POST /api/launch` SHALL answer 403 and the page SHALL hide the launcher.
19.4 IF a `POST` request has an `Origin` header that is not `http://127.0.0.1:<port>` or `http://localhost:<port>`, THEN the lab SHALL answer 403 (guards against cross-site requests from other tabs).
19.5 IF a request path matches no route, THEN the lab SHALL answer 404 with a JSON error and SHALL NOT read any file from disk based on the path.
