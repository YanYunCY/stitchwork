import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { parseFrontMatter } from '../src/skills/frontmatter.ts';
import { SkillRegistry, parseSkill, renderSkill } from '../src/skills/registry.ts';

describe('parseFrontMatter', () => {
  it('reads scalars, inline lists and dash lists', () => {
    const d = parseFrontMatter('---\nname: "x"\nagents: [claude, codex]\ntags:\n  - a\n  - b\n---\nBody');
    assert.deepEqual(d.data, { name: 'x', agents: ['claude', 'codex'], tags: ['a', 'b'] });
    assert.equal(d.body, 'Body');
  });
  it('returns the whole text as body when there is no front matter', () => {
    assert.deepEqual(parseFrontMatter('hello'), { data: {}, body: 'hello' });
  });
});

describe('skills', () => {
  it('requires name and description (Req 5.2, 5.4)', () => {
    assert.equal(parseSkill('a.md', '---\nname: a\n---\nx').ok, false);
    assert.equal(parseSkill('b.md', '---\ndescription: d\n---\nx').ok, false);
  });

  it('rejects unknown agents', () => {
    const r = parseSkill('c.md', '---\nname: c\ndescription: d\nagents: [claude, cursor]\n---\nx');
    assert.equal(r.ok, false);
  });

  it('renders every {{input}} placeholder (Req 5.3)', () => {
    const r = parseSkill('d.md', '---\nname: d\ndescription: d\n---\nA {{input}} B {{ input }} $&');
    assert.ok(r.ok);
    if (r.ok) assert.equal(renderSkill(r.skill, '$1'), 'A $1 B $1 $&');
  });

  it('keeps the first duplicate and warns (Req 5.5)', () => {
    const reg = new SkillRegistry();
    reg.add('1.md', '---\nname: x\ndescription: first\n---\n');
    reg.add('2.md', '---\nname: x\ndescription: second\n---\n');
    assert.equal(reg.get('x')?.description, 'first');
    assert.equal(reg.warnings.length, 1);
  });

  it('loads the built-in skills directory (Req 5.1, 5.6)', () => {
    const reg = SkillRegistry.fromDirectory(join(import.meta.dirname, '..', 'skills'));
    assert.deepEqual(reg.list().map((s) => s.name), ['code-review', 'explain']);
    assert.deepEqual(reg.get('explain')?.agents, ['gemini', 'opencode', 'claude']);
    assert.equal(reg.get('code-review')?.timeoutSeconds, 900);
    assert.deepEqual(reg.warnings, []);
  });

  it('returns an empty registry for a missing directory', () => {
    assert.equal(SkillRegistry.fromDirectory('/nope/does-not-exist').list().length, 0);
  });
});
