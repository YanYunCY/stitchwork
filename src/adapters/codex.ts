import { estimateTokens, estimateUsage, reportedUsage } from './types.ts';
import type { AgentAdapter } from './types.ts';

const TOKENS_LINE = /^\s*tokens used:?\s*([\d,]+)\s*$/im;

/** Codex CLI: `codex exec --skip-git-repo-check <prompt>` (plain-text output). */
export const codex: AgentAdapter = {
  id: 'codex',
  displayName: 'Codex CLI',
  defaultBinary: 'codex',
  buildArgs: (prompt, extraArgs) => ['exec', '--skip-git-repo-check', ...extraArgs, prompt],
  parse(stdout, stderr, prompt) {
    const match = TOKENS_LINE.exec(stdout) ?? TOKENS_LINE.exec(stderr);
    const output = stdout.replace(TOKENS_LINE, '').trim();
    if (match?.[1]) {
      const total = Number(match[1].replace(/,/g, ''));
      const input = Math.min(total, estimateTokens(prompt));
      return { output, usage: reportedUsage(input, total - input, total) };
    }
    return { output, usage: estimateUsage(prompt, output) };
  },
};
