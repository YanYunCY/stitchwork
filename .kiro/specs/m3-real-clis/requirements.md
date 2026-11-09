# Requirements: M3 — adapters verified against real CLIs

Numbering continues from `m2-demo-ready`.

### Requirement 14: Real CLI compatibility
**User story:** As a user with the current releases of Codex CLI, Claude Code, Gemini CLI and OpenCode, I want Stitchwork to read each one's real answer and real token counts, so that the shared ledger reflects what I actually spent.

**Acceptance criteria**
14.1 The Codex adapter SHALL invoke `codex exec --skip-git-repo-check --json` and SHALL take the answer from the last `item.completed` event whose item type is `agent_message`, and usage from the sum of `turn.completed.usage` (`input_tokens`, `output_tokens`).
14.2 IF Codex output contains no JSON events, THEN the adapter SHALL parse the plain-text `tokens used` summary whether the count is on the same line or the next line.
14.3 The OpenCode adapter SHALL invoke `opencode run --format json` and SHALL join the `text` parts as the answer and sum each `step_finish` part's tokens (input plus cache read and write as input; output plus reasoning as output).
14.4 The Gemini adapter SHALL pass `--skip-trust` so headless runs work outside a trusted folder.
14.5 WHEN Gemini prints an error object `{ error: { message, code } }` on stdout or stderr, the adapter SHALL return `Gemini error <code>: <message>` as the output.
14.6 The repository SHALL keep the raw output of each real CLI run used for verification in `test/fixtures/real/`, with ids and paths redacted, and tests SHALL parse every fixture.
14.7 The README SHALL list the CLI versions each adapter was verified against and what was not verified.
