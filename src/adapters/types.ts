import type { AgentId, Usage } from '../types.ts';

export interface ParsedRun {
  output: string;
  usage: Usage;
}

/** One "limb" of the gateway: how to call one agent CLI and read its answer. */
export interface AgentAdapter {
  id: AgentId;
  displayName: string;
  defaultBinary: string;
  buildArgs(prompt: string, extraArgs: readonly string[]): string[];
  parse(stdout: string, stderr: string, prompt: string): ParsedRun;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Fallback when a CLI reports no usage (Req 1.4). */
export function estimateUsage(prompt: string, output: string): Usage {
  const inputTokens = estimateTokens(prompt);
  const outputTokens = estimateTokens(output);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimated: true };
}

export function reportedUsage(inputTokens: number, outputTokens: number, total?: number): Usage {
  const i = Math.max(0, Math.round(inputTokens) || 0);
  const o = Math.max(0, Math.round(outputTokens) || 0);
  const t = total !== undefined && Number.isFinite(total) && total >= i + o ? Math.round(total) : i + o;
  return { inputTokens: i, outputTokens: o, totalTokens: t, estimated: false };
}

/** Parse the last JSON object in a string (CLIs sometimes print banners first). */
export function parseTrailingJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.lastIndexOf('\n{');
    if (start >= 0) {
      try {
        return JSON.parse(trimmed.slice(start + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
