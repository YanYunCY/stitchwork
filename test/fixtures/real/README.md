# Real CLI output fixtures

Recorded 2026-11-09 on Linux by running each real CLI once with the prompt
`Reply with exactly: pong`, exactly as Stitchwork's adapter invokes it.
Session ids, thread ids and paths are redacted; nothing else is edited.

| File | CLI | Command | Backend used for the recording |
| --- | --- | --- | --- |
| `codex-0.167.0.jsonl` | codex-cli 0.167.0 | `codex exec --skip-git-repo-check --json -m gpt-5-mini <prompt>` | OpenAI API key |
| `codex-0.167.0.plain.*` | codex-cli 0.167.0 | same without `--json` (stdout and stderr) | OpenAI API key |
| `claude-2.1.319.json` | Claude Code 2.1.319 | `claude -p <prompt> --output-format json` | Anthropic-compatible endpoint (DeepSeek) |
| `opencode-1.19.5.jsonl` | opencode 1.19.5 | `opencode run --format json -m deepseek/deepseek-flash <prompt>` | DeepSeek API |
| `gemini-0.67.0.error.json` | gemini-cli 0.67.0 | `gemini -p <prompt> --output-format json --skip-trust` | no valid Gemini key: an auth **error** sample only |

Not yet recorded: a successful Gemini CLI response (needs a Gemini API key or a
paid Google account), and real rate-limit responses from any vendor. The Gemini
success parser follows the documented headless schema (`response`, `stats`).
