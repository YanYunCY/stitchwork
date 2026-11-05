import { estimateUsage, isRecord, num, parseTrailingJson, reportedUsage } from './types.ts';
import type { AgentAdapter } from './types.ts';

/** Gemini CLI: `gemini -p <prompt> --output-format json` */
export const gemini: AgentAdapter = {
  id: 'gemini',
  displayName: 'Gemini CLI',
  defaultBinary: 'gemini',
  buildArgs: (prompt, extraArgs) => ['-p', prompt, '--output-format', 'json', ...extraArgs],
  parse(stdout, _stderr, prompt) {
    const json = parseTrailingJson(stdout);
    if (isRecord(json) && typeof json.response === 'string') {
      const models = isRecord(json.stats) && isRecord(json.stats.models) ? json.stats.models : undefined;
      if (models) {
        let input = 0;
        let output = 0;
        let total = 0;
        let seen = false;
        for (const m of Object.values(models)) {
          if (isRecord(m) && isRecord(m.tokens)) {
            seen = true;
            input += num(m.tokens.prompt);
            output += num(m.tokens.candidates);
            total += num(m.tokens.total);
          }
        }
        if (seen) return { output: json.response, usage: reportedUsage(input, output, total) };
      }
      return { output: json.response, usage: estimateUsage(prompt, json.response) };
    }
    const output = stdout.trim();
    return { output, usage: estimateUsage(prompt, output) };
  },
};
