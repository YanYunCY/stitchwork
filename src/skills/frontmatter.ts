export type FrontMatterValue = string | string[];

export interface ParsedDoc {
  data: Record<string, FrontMatterValue>;
  body: string;
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

/** Tiny front matter reader: `key: value`, `key: [a, b]`, and `- item` lists. No YAML dependency. */
export function parseFrontMatter(text: string): ParsedDoc {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) return { data: {}, body: normalized };
  const data: Record<string, FrontMatterValue> = {};
  let listKey: string | null = null;
  for (const raw of (match[1] ?? '').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim()) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const cur = data[listKey];
      data[listKey] = [...(Array.isArray(cur) ? cur : []), unquote(item[1] ?? '')];
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1] as string;
    const value = (kv[2] ?? '').trim();
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value.slice(1, -1).split(',').map(unquote).filter(Boolean);
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return { data, body: match[2] ?? '' };
}
