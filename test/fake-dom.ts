import vm from 'node:vm';

/** Just enough DOM for src/lab/page-js.ts: elements, text, attributes, events, class lists. */
export class FakeEl {
  tag: string;
  children: (FakeEl | string)[] = [];
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, (() => void)[]> = {};
  id = '';
  hidden = false;
  disabled = false;
  value = '';
  offsetWidth = 0;
  private cls = '';
  constructor(tag: string) { this.tag = tag; }
  get className() { return this.cls; }
  set className(v: string) { this.cls = v; }
  get classList() {
    const self = this;
    return {
      add(c: string) { if (!self.cls.split(' ').includes(c)) self.cls = (self.cls + ' ' + c).trim(); },
      remove(c: string) { self.cls = self.cls.split(' ').filter((x) => x && x !== c).join(' '); },
    };
  }
  get textContent(): string { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  set textContent(v: string) { this.children = v === '' ? [] : [v]; }
  appendChild(c: FakeEl | string) { this.children.push(c); return c; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  addEventListener(e: string, f: () => void) { (this.listeners[e] ??= []).push(f); }
  click() { (this.listeners.click ?? []).forEach((f) => f()); }
  all(): FakeEl[] { return this.children.flatMap((c) => (typeof c === 'string' ? [] : [c, ...c.all()])); }
  find(pred: (e: FakeEl) => boolean) { return this.all().filter(pred); }
}

export interface Harness {
  ids: Record<string, FakeEl>;
  root: FakeEl;
  /** run every queued setTimeout once */
  flush(): Promise<void>;
  fetchLog: { path: string; method: string; body?: unknown }[];
  intervals: (() => void)[];
}

type Route = (path: string, init: { method?: string; body?: string }) => { status: number; body: unknown };

export function runPage(js: string, ids: string[], route: Route): Harness {
  const root = new FakeEl('body');
  const byId: Record<string, FakeEl> = {};
  for (const id of ids) { const e = new FakeEl('div'); e.id = id; byId[id] = e; root.appendChild(e); }
  const timeouts: (() => void)[] = [];
  const intervals: (() => void)[] = [];
  const fetchLog: Harness['fetchLog'] = [];
  const sandbox = {
    document: {
      getElementById: (id: string) => byId[id] ?? null,
      createElement: (t: string) => new FakeEl(t),
      createTextNode: (t: string) => t,
      querySelectorAll: () => root.find((e) => e.className.split(' ').includes('cd')),
    },
    fetch: async (path: string, init: { method?: string; body?: string } = {}) => {
      fetchLog.push({ path, method: init.method ?? 'GET', ...(init.body ? { body: JSON.parse(init.body) } : {}) });
      const r = route(path, init);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
    },
    setTimeout: (f: () => void) => { timeouts.push(f); return 0; },
    setInterval: (f: () => void) => { intervals.push(f); return 0; },
    clearInterval: () => {},
    JSON, Math, Date, Number, String, Promise,
  };
  vm.runInNewContext(js, sandbox);
  return {
    ids: byId, root, fetchLog, intervals,
    flush: async () => {
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
      const run = timeouts.splice(0);
      run.forEach((f) => f());
      for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    },
  };
}
