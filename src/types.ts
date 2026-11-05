export const AGENT_IDS = ['codex', 'claude', 'gemini', 'opencode'] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && (AGENT_IDS as readonly string[]).includes(value);
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** true when the CLI reported no usage and we estimated from characters */
  estimated: boolean;
}

export interface RunResult {
  agent: AgentId;
  ok: boolean;
  output: string;
  usage: Usage;
  durationMs: number;
  exitCode: number | null;
}

export interface Limits {
  tokens?: number;
  requests?: number;
}
