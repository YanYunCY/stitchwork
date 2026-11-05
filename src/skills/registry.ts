import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAgentId } from '../types.ts';
import type { AgentId } from '../types.ts';
import { parseFrontMatter } from './frontmatter.ts';

export interface Skill {
  name: string;
  description: string;
  agents: AgentId[];
  timeoutSeconds?: number;
  template: string;
  file: string;
}

export type SkillParse = { ok: true; skill: Skill } | { ok: false; reason: string };

export function parseSkill(file: string, text: string): SkillParse {
  const { data, body } = parseFrontMatter(text);
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!name) return { ok: false, reason: `${file}: missing "name" in front matter` };
  if (!description) return { ok: false, reason: `${file}: missing "description" in front matter` };
  const rawAgents = Array.isArray(data.agents) ? data.agents : typeof data.agents === 'string' ? [data.agents] : [];
  const agents = rawAgents.filter(isAgentId);
  const unknown = rawAgents.filter((a) => !isAgentId(a));
  if (unknown.length) return { ok: false, reason: `${file}: unknown agent(s) ${unknown.join(', ')}` };
  const t = typeof data.timeoutSeconds === 'string' ? Number(data.timeoutSeconds) : undefined;
  const skill: Skill = { name, description, agents, template: body.trim(), file };
  if (t !== undefined && Number.isFinite(t) && t > 0) skill.timeoutSeconds = t;
  return { ok: true, skill };
}

/** Replace every {{ input }} placeholder (Req 5.3). */
export function renderSkill(skill: Skill, input: string): string {
  return skill.template.replace(/\{\{\s*input\s*\}\}/g, () => input);
}

export class SkillRegistry {
  private readonly skills = new Map<string, Skill>();
  readonly warnings: string[] = [];

  static fromDirectory(dir: string): SkillRegistry {
    const reg = new SkillRegistry();
    if (!existsSync(dir)) return reg;
    const files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
    for (const f of files) reg.add(join(dir, f), readFileSync(join(dir, f), 'utf8'));
    return reg;
  }

  add(file: string, text: string): void {
    const parsed = parseSkill(file, text);
    if (!parsed.ok) return void this.warnings.push(`skipped ${parsed.reason}`);
    const existing = this.skills.get(parsed.skill.name);
    if (existing) {
      this.warnings.push(`duplicate skill "${parsed.skill.name}" in ${file}; keeping ${existing.file}`);
      return;
    }
    this.skills.set(parsed.skill.name, parsed.skill);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return [...this.skills.values()];
  }
}
