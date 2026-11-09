import { estimateUsage, isRecord, num, parseJsonLines, reportedUsage } from './types.ts';
import type { AgentAdapter } from './types.ts';

/**
 * OpenCode: `opencode run --format json <prompt>`.
 * JSON events (verified on opencode 1.19.5): `text` parts carry the answer;
 * each `step_finish` part carries `tokens { input, output, reasoning, cache }`.
 */
export const opencode: AgentAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  defaultBinary: 'opencode',
  buildArgs: (prompt, extraArgs) => ['run', '--format', 'json', ...extraArgs, prompt],
  parse(stdout, _stderr, prompt) {
    const events = parseJsonLines(stdout);
    if (events.length === 0) {
      const output = stdout.trim();
      return { output, usage: estimateUsage(prompt, output) };
    }
    const texts: string[] = [];
    let input = 0;
    let output = 0;
    let seen = false;
    for (const e of events) {
      const part = isRecord(e.part) ? e.part : undefined;
      if (!part) continue;
      if (e.type === 'text' && typeof part.text === 'string') texts.push(part.text);
      if (e.type === 'step_finish' && isRecord(part.tokens)) {
        seen = true;
        const cache = isRecord(part.tokens.cache) ? part.tokens.cache : {};
        input += num(part.tokens.input) + num(cache.read) + num(cache.write);
        output += num(part.tokens.output) + num(part.tokens.reasoning);
      }
    }
    const text = texts.join('').trim();
    return { output: text, usage: seen ? reportedUsage(input, output) : estimateUsage(prompt, text) };
  },
};
