import { estimateTokens, estimateUsage, isRecord, num, parseJsonLines, reportedUsage } from './types.ts';
import type { AgentAdapter, ParsedRun } from './types.ts';

/** Plain-text summary: "tokens used" then the count, same line or the next (Codex 0.167). */
const TOKENS_LINE = /^\s*tokens used:?\s*\n?\s*([\d,]+)\s*$/im;

/**
 * Codex CLI: `codex exec --skip-git-repo-check --json <prompt>`.
 * JSONL events (verified on codex-cli 0.167.0): `item.completed` with an
 * `agent_message` item carries the answer; `turn.completed.usage` carries tokens.
 */
export const codex: AgentAdapter = {
  id: 'codex',
  displayName: 'Codex CLI',
  defaultBinary: 'codex',
  buildArgs: (prompt, extraArgs) => ['exec', '--skip-git-repo-check', '--json', ...extraArgs, prompt],
  parse(stdout, stderr, prompt) {
    const events = parseJsonLines(stdout);
    if (events.length > 0) return parseEvents(events, prompt);
    return parsePlain(stdout, stderr, prompt);
  },
};

function parseEvents(events: Record<string, unknown>[], prompt: string): ParsedRun {
  const messages: string[] = [];
  const errors: string[] = [];
  let input = 0;
  let output = 0;
  let seen = false;
  for (const e of events) {
    if (e.type === 'item.completed' && isRecord(e.item)) {
      if (e.item.type === 'agent_message' && typeof e.item.text === 'string') messages.push(e.item.text);
    } else if (e.type === 'turn.completed' && isRecord(e.usage)) {
      seen = true;
      input += num(e.usage.input_tokens);
      output += num(e.usage.output_tokens);
    } else if ((e.type === 'turn.failed' || e.type === 'error') && (typeof e.message === 'string' || isRecord(e.error))) {
      const msg = typeof e.message === 'string' ? e.message : isRecord(e.error) ? String(e.error.message ?? '') : '';
      if (msg) errors.push(msg);
    }
  }
  const text = (messages.at(-1) ?? errors.join('\n')).trim();
  return { output: text, usage: seen ? reportedUsage(input, output) : estimateUsage(prompt, text) };
}

function parsePlain(stdout: string, stderr: string, prompt: string): ParsedRun {
  const match = TOKENS_LINE.exec(stdout) ?? TOKENS_LINE.exec(stderr);
  const output = stdout.replace(TOKENS_LINE, '').trim();
  if (match?.[1]) {
    const total = Number(match[1].replace(/,/g, ''));
    const input = Math.min(total, estimateTokens(prompt));
    return { output, usage: reportedUsage(input, total - input, total) };
  }
  return { output, usage: estimateUsage(prompt, output) };
}
