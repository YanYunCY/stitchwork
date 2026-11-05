import { estimateUsage, isRecord, num, parseTrailingJson, reportedUsage } from './types.ts';
import type { AgentAdapter } from './types.ts';

/** Claude Code: `claude -p <prompt> --output-format json` */
export const claude: AgentAdapter = {
  id: 'claude',
  displayName: 'Claude Code',
  defaultBinary: 'claude',
  buildArgs: (prompt, extraArgs) => ['-p', prompt, '--output-format', 'json', ...extraArgs],
  parse(stdout, _stderr, prompt) {
    const json = parseTrailingJson(stdout);
    if (isRecord(json) && typeof json.result === 'string') {
      const u = isRecord(json.usage) ? json.usage : undefined;
      if (u) {
        const input =
          num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
        return { output: json.result, usage: reportedUsage(input, num(u.output_tokens)) };
      }
      return { output: json.result, usage: estimateUsage(prompt, json.result) };
    }
    const output = stdout.trim();
    return { output, usage: estimateUsage(prompt, output) };
  },
};
