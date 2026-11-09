# Demo video script (target 2:50, hard limit under 3:00)

**Setup.** Kiro on the left, a terminal with a large font on the right. Dark theme. No music, or a track you made yourself (the rules forbid copyrighted music). Record the terminal parts with `stitchwork demo --pace 900` so every beat is reproducible. Keep vendor logos off screen unless they are part of the CLI output.

**Voice-over budget.** About 255 words at a calm pace, so visuals carry the rest. The timings add up to 2:50, leaving 10 seconds of slack. If a take runs long, shorten the lab segment first.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:15 | Four terminal panes: codex, claude, gemini, opencode. One prints `429 RESOURCE_EXHAUSTED`. | "I pay for four coding agents. That's four CLIs, four logins, four quota meters, and I only find out one is empty when it dies halfway through a task." |
| 0:15–0:25 | Title card: 🧟 Stitchwork, "one gateway, every agent". | "So I stitched them into one creature. Stitchwork is an open-source MCP gateway with a single shared quota ledger." |
| 0:25–0:50 | Kiro: `.kiro/steering/tech.md`, then `specs/m2-demo-ready/requirements.md` scrolling EARS criteria, then `tasks.md` with ticks; cut to `git log --oneline` showing task ids. | "I built it spec-first in Kiro. Steering files pin the rules: zero runtime dependencies, plain TypeScript. Two specs hold thirteen requirements in EARS form, and every commit maps to a task." |
| 0:50–1:05 | Edit a test so it fails, save; the `test-on-save` hook fires and Kiro fixes it. Flash the hook list. | "Agent hooks keep it honest: tests run on every save, a checklist guards new adapters, and a privacy hook makes sure prompts never reach the ledger." |
| 1:05–1:15 | Terminal: `stitchwork demo --pace 900`, the agents table. | "Here's the creature. Four limbs, all wired through one gateway." |
| 1:15–1:35 | Claude task 1 and 2 succeed; task 3 is refused with "Quota frees up in ~60 min". | "Claude does two jobs. On the third, the ledger says no before a single token is wasted, and tells me when the window frees up." |
| 1:35–1:45 | The same task with `auto` lands on Codex. | "Same task with auto routing: it goes to the agent with the most headroom." |
| 1:45–2:05 | The explain skill prefers Gemini; Gemini answers 429; "↪ rate-limited; trying another agent"; OpenCode answers. Next request skips Gemini. | "Now the nasty case. Gemini rate-limits me mid-request. Stitchwork fails over to OpenCode automatically, and puts Gemini on a cooldown that survives restarts." |
| 2:05–2:15 | Kiro chat: "use stitchwork to review this diff" → `skill_run code-review` tool call with progress. | "Because it speaks MCP, Kiro itself can delegate to any of them, with live progress and cancel." |
| 2:15–2:32 | Browser on `stitchwork lab --config examples/demo.config.json --open`: four limbs with glass-tube gauges; click Run on the `explain` skill; the Gemini limb shows "stitches healing" and the tray marks the failover with 🧵. | "And this is the lab. Every agent is a limb with a live quota tube. A rate-limited limb shows stitches healing, and the tray marks every failover." |
| 2:32–2:42 | `npm test` summary; scroll the fast-check property names P1 to P12. | "Nearly two hundred tests, including property-based tests for the quota math, the failover bound and the lab's local-only guard." |
| 2:42–2:50 | GitHub repo page: MIT in About, `/.kiro` folder visible. Title card. | "MIT licensed, no keys stored, ever. Stitchwork: one gateway, every agent." |

## Shot checklist
- [ ] Kiro spec view with EARS criteria and ticked tasks
- [ ] A hook firing (screen-record the real event, don't fake it)
- [ ] `stitchwork demo --pace 900` full run
- [ ] Kiro calling Stitchwork over MCP, with a progress update visible
- [ ] The lab in a browser: gauges, a cooldown badge, the tray, a skill run
- [ ] `npm test` green
- [ ] Repo page showing MIT in About and the `/.kiro` folder

## Recording tips
- Run `stitchwork demo` once before recording; it uses a temp ledger, so every take starts fresh.
- The lab uses `.stitchwork/demo-ledger.jsonl` from `examples/demo.config.json`. Delete that file before each take, and start it with `STITCHWORK_FAKE_RATE_LIMIT=gemini` set so the failover and the cooldown badge appear on camera.
- Set `NO_COLOR=1` if the colours clash with your terminal theme.
- Upload to YouTube as **Public**, title "Stitchwork: one MCP gateway for Codex, Claude Code, Gemini CLI and OpenCode (Kiroween 2026)", and paste the link into Devpost.
