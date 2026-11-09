# Design: M3 — adapters verified against real CLIs

## Findings from the real CLIs (2026-11-09)

| CLI | Version | Finding | Change |
| --- | --- | --- | --- |
| Codex CLI | 0.167.0 | Plain mode prints `tokens used` and the count on **separate lines**, so the M1 regex never matched and every Codex run was estimated. `--json` emits JSONL with exact usage. | Use `--json`; keep a plain-text fallback that accepts both layouts (14.1, 14.2). |
| Claude Code | 2.1.319 | `-p --output-format json` result object matches the M1 parser (`result`, `usage.*_tokens`). | None; fixture added. |
| Gemini CLI | 0.67.0 | Headless runs outside a trusted folder exit 55 with a trust error. Errors print a JSON `error` object on stderr. | Add `--skip-trust`; surface the error message (14.4, 14.5). |
| OpenCode | 1.19.5 | `--format json` emits events with per-step token counts; plain mode reports nothing. | Use `--format json` (14.3). |

## Parsing helper

`parseJsonLines(text)` in `src/adapters/types.ts` returns every line that parses as a JSON object and skips banners, so adapters tolerate warnings mixed into stdout.

## Not covered

- A successful Gemini CLI response was not recorded (no Gemini key available); its parser follows the documented headless schema.
- No vendor rate-limit response was recorded; rate-limit detection still relies on the M2 text patterns.
