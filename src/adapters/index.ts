import type { AgentId } from '../types.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { gemini } from './gemini.ts';
import { opencode } from './opencode.ts';
import type { AgentAdapter } from './types.ts';

export const ADAPTERS: Readonly<Record<AgentId, AgentAdapter>> = { codex, claude, gemini, opencode };

export function getAdapter(id: AgentId): AgentAdapter {
  return ADAPTERS[id];
}

export type { AgentAdapter, ParsedRun } from './types.ts';
