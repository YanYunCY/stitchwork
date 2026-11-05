# Demo video script (target 2:45, hard limit 3:00)

Recording setup: terminal (large font) + Kiro side by side. No copyrighted music. Use either real CLIs or `examples/fake-agents` on `PATH` with `examples/demo.config.json` (small limits make the quota story visible in seconds).

| Time | Scene | Voice-over (draft) |
| --- | --- | --- |
| 0:00–0:15 | Four terminals: codex, claude, gemini, opencode. One fails with a rate-limit error. | "I pay for four coding agents. Four CLIs, four logins, four quota meters, and I only find out one is empty when it dies mid-task." |
| 0:15–0:30 | Title card: 🧟 Stitchwork, stitched-together limbs logo. | "So I stitched them into one creature: Stitchwork, an open-source MCP gateway with one shared quota ledger." |
| 0:30–0:55 | Kiro: open `.kiro/steering` and `specs/mvp-gateway/requirements.md`, scroll EARS criteria, then tasks.md with ticks. | "I built it spec-first in Kiro: steering docs pin the rules, the spec has 40-odd EARS criteria, and every commit maps to a task." |
| 0:55–1:10 | Show a hook firing on save: tests run, Kiro fixes a red test. | "Agent hooks run typecheck and tests on every save, and a checklist hook keeps new adapters honest." |
| 1:10–1:40 | Kiro chat with Stitchwork as MCP server: "use stitchwork to review this diff". Tool call `skill_run code-review` → answer from Claude, footer shows tokens. | "Now Kiro itself calls Stitchwork. One tool, any agent. The code-review skill prefers Claude." |
| 1:40–2:10 | Run twice more until Claude is exhausted; `quota_status` shows claude EXHAUSTED; next call auto-routes to Codex. | "Claude's window is spent, so the ledger refuses it before wasting a call, and auto-routing hands the job to Codex." |
| 2:10–2:30 | `stitchwork quota` and `cat .stitchwork/ledger.jsonl`. | "The ledger is plain JSONL: counts only, never prompts or keys. Keys stay in your environment." |
| 2:30–2:45 | `npm test` → 76 passing incl. property tests; GitHub repo with MIT license and /.kiro. | "Zero runtime dependencies, property-tested quota math, MIT licensed. Stitchwork: one gateway, every agent." |

Shot list checklist: Kiro spec view · hook trigger · MCP tool call inside Kiro · quota refusal + reroute · tests green · repo page.
