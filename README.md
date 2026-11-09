# 🧟 Stitchwork

> One MCP gateway, four coding agents, one shared quota ledger.
> 一个 MCP 网关，缝合四个编码 agent，共用一本配额账。

**Stitchwork** is an open-source control plane that stitches **Codex CLI**, **Claude Code**, **Gemini CLI** and **OpenCode** together behind one MCP-aware gateway. Any MCP client (Kiro, Claude Desktop, Cursor, or another agent) sees one uniform set of tools. Stitchwork decides which limb does the work, checks a shared quota ledger **before** every run, fails over when a vendor rate-limits you, and lets you package prompts as reusable **skills**.

Built spec-first in [Kiro](https://kiro.dev) for **Kiroween 2026, Frankenstein category**. Everything Kiro uses lives in [`/.kiro`](./.kiro): steering docs, two specs, agent hooks and the MCP config.

[English](#english) · [中文](#中文)

---

## English

### See it in 30 seconds (no subscriptions, no tokens)

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
node bin/stitchwork.js demo        # Node 22.18+, nothing to install
```

The demo runs bundled stand-in CLIs against a throwaway ledger and shows the whole story: Claude runs twice, the ledger refuses a third call before it is wasted, `auto` hands the job to Codex, Gemini answers `429` and the request fails over to OpenCode, and Gemini is skipped while it cools down. Add `--pace 900` to slow it down for screen recording.

### Why

If you pay for more than one coding agent, you juggle four CLIs, four logins and four quota meters, and you only learn one is empty when it dies mid-task.

| Problem | Stitchwork |
| --- | --- |
| Four different CLIs and flags | One MCP tool: `agent_run` |
| Quota exhaustion discovered too late | Shared rolling-window ledger, checked **before** every run |
| A vendor rate-limits you mid-task | Automatic failover to the next eligible agent, plus a cooldown |
| "Which agent should do this?" | `agent: "auto"` routes to the healthy agent with the most headroom |
| A long run looks hung | MCP progress notifications; cancel kills the agent process |
| Copy-pasting the same prompts | Markdown **skills** with front matter and preferred agents |

### Features

- **MCP gateway** over stdio (JSON-RPC 2.0, protocol `2025-06-18`), zero runtime dependencies.
- **Adapters** for `codex exec`, `claude -p`, `gemini -p`, `opencode run`, each parsing reported usage, with a character-based estimate when a CLI reports none.
- **Shared quota ledger**: per-agent token and request limits over a rolling window, append-only JSONL, counts only.
- **Router**: explicit agent, or `auto` (skill's preferred agents first, then most headroom).
- **Rate-limit failover**: a `429` / "usage limit" / `RESOURCE_EXHAUSTED` failure on an auto run is retried on the next agent (up to `maxFallbacks`, default 2); the limited agent cools down for `cooldownMinutes` (default 15), persisted in the ledger. Explicit runs never fail over.
- **Progress and cancellation**: `notifications/progress` when the client sends a `progressToken`; `notifications/cancelled` kills the child process.
- **Skills**: `skills/*.md` with `name`, `description`, `agents`, `timeoutSeconds` and an `{{input}}` template.
- **The lab**: `stitchwork lab` serves a local web dashboard (an operating table with live quota gauges, recent runs and a skill launcher).
- **CLI**: `stitchwork serve | agents | quota | skills | run | doctor | demo | lab`.

### The lab

```bash
stitchwork lab [--port 7777] [--open] [--read-only]
# no install? from a clone, against the bundled stand-in agents:
node bin/stitchwork.js lab --config examples/demo.config.json --open
```

Each agent is a stitched limb with a glass-tube gauge for tokens and for requests (green, amber under 30% left, red under 10%), its reset time, a "stitches healing" badge with a countdown while it cools down, and a dimmed state when it is disabled or not installed. Below sit the last 20 runs from the ledger (one row per attempt, `~` for estimated tokens, 🧵 for failover or a rate limit) and a skill launcher with Run and Cancel. The page refreshes every 2 seconds and says so when the server stops answering.

- **Local only.** It binds to `127.0.0.1` (there is no `--host`), answers 403 to any `Host` that is not `127.0.0.1:<port>` or `localhost:<port>` (DNS rebinding), and answers 403 to a `POST` from another origin.
- **Read-only until you click Run.** The only thing that can spend quota is `POST /api/launch`. It goes through the same gateway as MCP and the CLI (routing, quota checks, failover), allows one launch at a time (409 otherwise), and is aborted by Cancel or by closing the tab. `--read-only` turns the launcher off (403) and hides it.
- **Self-contained.** One HTML document with inline CSS and JS, built on `node:http`: no remote fonts, scripts or images, no dependency, and unknown paths never touch the filesystem.
- **Nothing sensitive.** Runs show counts and timings only; prompts, outputs and environment values are never in the ledger or the run list (a launch response returns the output to the tab that asked for it).

Spec: [`m3-lab`](./.kiro/specs/m3-lab) (Requirements 15–19, properties P7–P12).

### MCP tools

| Tool | What it does |
| --- | --- |
| `agents_list` | Agents, whether each binary is on `PATH`, remaining headroom, cooldown |
| `agent_run` | Run a prompt on `codex`, `claude`, `gemini`, `opencode`, or `auto` |
| `skills_list` | Reusable skills and the agents they prefer |
| `skill_run` | Render a skill with an input and run it through the router |
| `quota_status` | Tokens and requests per agent in the current window |

Every run returns `agent`, `ok`, `output`, `usage { inputTokens, outputTokens, totalTokens, estimated }`, `durationMs`, `exitCode`, `routedBy` and `fallbacks` as structured content.

### Verified CLI versions

Each adapter was run against the real CLI on 2026-11-09; the raw output is kept in [`test/fixtures/real/`](./test/fixtures/real) and parsed by the tests.

| Agent | Version | Invocation | Usage |
| --- | --- | --- | --- |
| Codex CLI | 0.167.0 | `codex exec --skip-git-repo-check --json` | reported (`turn.completed.usage`) |
| Claude Code | 2.1.319 | `claude -p --output-format json` | reported (`usage`) |
| Gemini CLI | 0.67.0 | `gemini -p --output-format json --skip-trust` | flags and error format verified; a successful run was not recorded |
| OpenCode | 1.19.5 | `opencode run --format json` | reported (`step_finish.tokens`) |

### Install and connect

Requires **Node.js 22.18+** and at least one agent CLI installed and signed in.

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
npm install && npm run build && npm install -g .
stitchwork doctor            # which CLIs are on PATH, their versions, your limits
stitchwork run --agent auto "Explain src/quota/ledger.ts in 3 bullets"
```

Add it to any MCP client. In Kiro, `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "stitchwork": { "command": "stitchwork", "args": ["serve"] }
  }
}
```

### Configuration

Optional `stitchwork.config.json` in the working directory (see [`stitchwork.config.example.json`](./stitchwork.config.example.json)):

| Key | Default | Meaning |
| --- | --- | --- |
| `windowMinutes` | 300 | Rolling window for limits |
| `timeoutSeconds` | 600 | Per-run timeout (a skill can override) |
| `cooldownMinutes` | 15 | How long a rate-limited agent is skipped |
| `maxFallbacks` | 2 | How many other agents an auto run may try (0–3) |
| `ledgerPath` | `.stitchwork/ledger.jsonl` | Where usage counts are appended |
| `skillsDir` | `skills` | Where skills are read from |
| `agents.<id>` | enabled | `enabled`, `binary`, `extraArgs`, `limits.tokens`, `limits.requests` |

Secrets are **never** stored in config or the ledger. Each CLI keeps its own login; API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, …) are read only from the environment and passed through to the child process.

### Develop

```bash
npm install
npm run typecheck
npm test                  # unit, property-based (fast-check), end-to-end MCP, real child processes
```

### Built with Kiro

How the specs, steering, hooks, MCP and property tests were used: [`docs/KIRO_USAGE.md`](./docs/KIRO_USAGE.md). Specs: [`mvp-gateway`](./.kiro/specs/mvp-gateway), [`m2-demo-ready`](./.kiro/specs/m2-demo-ready), [`m3-real-clis`](./.kiro/specs/m3-real-clis), [`m3-lab`](./.kiro/specs/m3-lab). Roadmap: [`docs/MILESTONES.md`](./docs/MILESTONES.md).

### Status and limits

- Adapters were verified against Codex CLI 0.167.0, Claude Code 2.1.319, Gemini CLI 0.67.0 and OpenCode 1.19.5 (see the table above). A successful Gemini run and real vendor rate-limit responses have not been recorded yet; newer CLI releases may change their output.
- Quota is what Stitchwork has seen. Usage you make outside the gateway is not counted yet.

### License

[MIT](./LICENSE)

---

## 中文

### 30 秒看效果（不需要任何订阅、不花 token）

```bash
git clone https://github.com/YanYunCY/stitchwork && cd stitchwork
node bin/stitchwork.js demo        # Node 22.18+，无需安装依赖
```

演示用仓库自带的模拟 CLI 和一次性账本跑完整流程：Claude 跑两次，第三次在浪费调用之前被账本拒绝；`auto` 把任务交给 Codex；Gemini 返回 `429`，请求自动转给 OpenCode；之后 Gemini 在冷却期内被跳过。录屏时加 `--pace 900` 放慢节奏。

### 为什么做

同时订阅好几个编码 agent，就要在四个 CLI、四套登录、四个配额表之间切换，往往任务跑一半失败了才知道额度用完。

| 痛点 | Stitchwork 的做法 |
| --- | --- |
| 四个 CLI，参数各不相同 | 一个 MCP 工具：`agent_run` |
| 额度耗尽发现得太晚 | 共享滚动窗口账本，每次运行**之前**先检查 |
| 跑到一半被厂商限流 | 自动转给下一个可用 agent，并让被限流的 agent 冷却 |
| 不知道该派哪个 agent | `agent: "auto"` 路由到剩余额度最多的健康 agent |
| 长任务看起来像卡住 | MCP 进度通知；取消会结束 agent 进程 |
| 同样的提示词反复粘贴 | 带 front matter 和首选 agent 的 Markdown **skills** |

### 功能

- **MCP 网关**：stdio，JSON-RPC 2.0，协议 `2025-06-18`，运行时零依赖。
- **适配器**：`codex exec`、`claude -p`、`gemini -p`、`opencode run`，各自解析用量，解析不到时按字符数估算。
- **共享配额账本**：每个 agent 的 token 与请求数上限，滚动窗口统计，追加写 JSONL，只记计数。
- **路由**：指定 agent，或 `auto`（先按 skill 首选，再按剩余额度）。
- **限流自动转派**：`auto` 运行遇到 `429`、"usage limit"、`RESOURCE_EXHAUSTED` 等失败时，换下一个 agent 重试（最多 `maxFallbacks` 次，默认 2）；被限流的 agent 冷却 `cooldownMinutes`（默认 15 分钟），冷却状态写在账本里，跨进程有效。指定 agent 的运行不会转派。
- **进度与取消**：客户端带 `progressToken` 时发送 `notifications/progress`；收到 `notifications/cancelled` 时结束子进程。
- **Skills**：`skills/*.md`，含 `name`、`description`、`agents`、`timeoutSeconds` 与 `{{input}}` 模板。
- **实验室**：`stitchwork lab` 在本机启动网页仪表盘（手术台主题：实时配额仪表、最近运行、skill 启动器）。
- **命令行**：`stitchwork serve | agents | quota | skills | run | doctor | demo | lab`。

### 实验室

```bash
stitchwork lab [--port 7777] [--open] [--read-only]
# 不想安装？在仓库里用自带的模拟 agent：
node bin/stitchwork.js lab --config examples/demo.config.json --open
```

每个 agent 是一条缝合的"肢体"：token 与请求各有一根玻璃管仪表（剩余低于 30% 变琥珀色，低于 10% 变红），显示重置时间；冷却期间显示"伤口愈合中"徽章和倒计时；被禁用或未安装时变暗并说明原因。下方是账本里最近 20 次运行（每次尝试一行，估算 token 前加 `~`，转派或限流标 🧵），以及带"运行/取消"按钮的 skill 启动器。页面每 2 秒刷新，服务器无响应时会明确提示"已断开"。

- **仅限本机**：只监听 `127.0.0.1`（没有 `--host` 选项）；`Host` 不是 `127.0.0.1:<端口>` 或 `localhost:<端口>` 时返回 403（防 DNS 重绑定）；来自其他来源的 `POST` 也返回 403。
- **不点"运行"就只读**：唯一会消耗额度的是 `POST /api/launch`，它和 MCP、命令行走同一个网关（路由、配额检查、转派），同一时间只允许一个任务（再来一个返回 409），点"取消"或关闭标签页会中止任务。`--read-only` 会关闭并隐藏启动器（返回 403）。
- **自包含**：基于 `node:http` 的单个 HTML 页面，内联 CSS 与 JS，不加载任何远程字体、脚本或图片，也没有新增依赖；未知路径不会读取文件系统。
- **不含敏感信息**：运行记录只有计数和耗时，提示词、输出和环境变量不会出现在账本或运行列表里（启动任务的响应只把输出返回给发起请求的那个标签页）。

规格见 [`m3-lab`](./.kiro/specs/m3-lab)（需求 15–19，性质 P7–P12）。

### 安装与接入

需要 **Node.js 22.18+**，以及至少一个已安装并登录的 agent CLI。

```bash
npm install && npm run build && npm install -g .
stitchwork doctor            # 检查哪些 CLI 在 PATH 上、版本和额度设置
```

在 Kiro 的 `.kiro/settings/mcp.json` 中加入：`{"mcpServers": {"stitchwork": {"command": "stitchwork", "args": ["serve"]}}}`。

### 配置与密钥

可选的 `stitchwork.config.json` 放在工作目录，字段见上方英文表格。密钥**从不**写进配置或账本：各 CLI 用自己的登录态，API key 只从环境变量读取并透传给子进程。

### 现状与限制

- 适配器已对照 Codex CLI 0.167.0、Claude Code 2.1.319、Gemini CLI 0.67.0、OpenCode 1.19.5 实测（原始输出见 `test/fixtures/real/`）。Gemini 成功响应和各家真实限流响应尚未录到，CLI 新版本可能改变输出格式。
- 配额只统计经过 Stitchwork 的用量，网关之外的用量暂不计入。

### 许可证

[MIT](./LICENSE)
