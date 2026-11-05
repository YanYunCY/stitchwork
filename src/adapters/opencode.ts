import { estimateUsage } from './types.ts';
import type { AgentAdapter } from './types.ts';

/** OpenCode: `opencode run <prompt>` (plain text, no usage reported). */
export const opencode: AgentAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  defaultBinary: 'opencode',
  buildArgs: (prompt, extraArgs) => ['run', ...extraArgs, prompt],
  parse(stdout, _stderr, prompt) {
    const output = stdout.trim();
    return { output, usage: estimateUsage(prompt, output) };
  },
};
