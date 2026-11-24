// Herdr-style harness: a mod's real source runs over stubbed `gpui-kit`, `gpui-base` and
// `herdr` modules (Bun's mock.module), so relative imports between mod files work as in
// Herdr. Elements record their children and every builder call; the `herdr` stub records
// each command, overlay, notification, exec and shared write in `env.calls`.
// Pattern from Herdr's scripts/picker.test.ts (v0.1.15), extended to ES-module imports.
import { mock } from "bun:test";

export type Call = { fn: string; args: unknown[] };

export class El {
  kind: string;
  arg: unknown;
  nodes: unknown[] = [];
  calls: Record<string, any[]> = {};
  all: Record<string, any[][]> = {};
  constructor(kind: string, arg?: unknown) {
    this.kind = kind;
    this.arg = arg;
    // biome-ignore lint/correctness/noConstructorReturn: the proxy is the element
    return new Proxy(this, {
      get: (target: any, key: string) => {
        if (key in target) return target[key];
        return (...args: any[]) => {
          const self = target.proxy;
          if (key === "child") target.nodes.push(args[0]);
          else if (key === "children") target.nodes.push(...args[0]);
          else if (key === "when") {
            if (args[0]) args[1](self);
          } else {
            // Mouse handlers differ by button: keep them apart.
            const name = key.startsWith("on_mouse_") ? `${key}:${args[0]}` : key;
            target.calls[name] = args;
            target.all[name] = [...(target.all[name] ?? []), args];
          }
          return self;
        };
      },
    });
  }
}

function el(kind: string, arg?: unknown): any {
  const e: any = new El(kind, arg);
  e.proxy = e;
  return e;
}

export type Env = {
  calls: Call[];
  tasks: Promise<unknown>[];
  timers: { ms: number; fn: (cx: any) => void; every: boolean }[];
  exec: (
    cmd: string,
    args: string[],
    opts?: unknown,
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  hc: (
    args: string[],
  ) =>
    | { code: number; stdout: string; stderr: string }
    | Promise<{ code: number; stdout: string; stderr: string }>;
  fetch: (url: string, opts?: any) => Promise<any>;
  spaces: any[];
  panes: any[];
  terminals: any[];
  machines: any[];
  focused: any;
  shared: Record<string, unknown>;
  props: any;
  layout: any;
  keys: any[];
  files: Record<string, string>;
  commands: string[];
  overlays: number;
};

export const env: Env = {} as Env;

// Set once the mocks below exist and main.js can load; reset() refills the registry from then on.
let refill: (() => void) | null = null;

export function reset() {
  refill?.();
  Object.assign(env, {
    calls: [],
    tasks: [],
    timers: [],
    exec: async () => ({ code: 127, stdout: "", stderr: "bakers: not found" }),
    hc: () => ({ code: 0, stdout: "{}", stderr: "" }),
    fetch: async () => {
      throw new Error("no network in tests");
    },
    spaces: [],
    panes: [],
    terminals: [],
    machines: [],
    focused: null,
    shared: {},
    props: {},
    layout: { id: "root", children: [] },
    keys: [],
    files: {},
    commands: [],
    overlays: 0,
  });
}
reset();

const record =
  (fn: string, result?: (...args: any[]) => unknown) =>
  (...args: unknown[]) => {
    env.calls.push({ fn, args });
    return result ? result(...args) : null;
  };

export class InputStub {
  text: string;
  placeholder?: string;
  handlers: Record<string, (e: unknown, cx: unknown) => void> = {};
  focused = false;
  constructor(options: { value?: string; placeholder?: string } = {}) {
    this.text = options.value ?? "";
    this.placeholder = options.placeholder;
  }
  value() {
    return this.text;
  }
  set_value(v: string) {
    this.text = v;
  }
  on(name: string, handler: (e: unknown, cx: unknown) => void) {
    this.handlers[name] = handler;
    return true;
  }
  focus() {
    this.focused = true;
  }
  set_rows() {}
  set_auto_grow() {}
  set_soft_wrap() {}
  release() {
    return true;
  }
  /** Types text as a person would: sets the value and fires `change`. */
  type(v: string) {
    this.text = v;
    this.handlers.change?.({}, cx());
  }
  submit(e: unknown = {}) {
    this.handlers.submit?.(e, cx());
  }
}

class ViewBase {}

mock.module("gpui-kit", () => ({
  View: ViewBase,
  div: () => el("div"),
  svg: (path: string) => el("svg", path),
  image: (path: string) => el("image", path),
}));

mock.module("gpui-base", () => ({
  h_flex: () => el("h_flex"),
  v_flex: () => el("v_flex"),
  ScrollHandle: { new: () => ({ scroll_to_item() {} }) },
  InputState: { new: (o?: any) => new InputStub(o) },
  TextareaState: { new: (o?: any) => new InputStub(o) },
  Input: { new: (state: unknown) => el("Input", state) },
  Textarea: { new: (state: unknown) => el("Textarea", state) },
  TextView: { markdown: (id: string, text: string) => el("markdown", { id, text }) },
  Checkbox: (props?: unknown) => el("Checkbox", props),
}));

mock.module("herdr", () => ({
  run: record("run"),
  notify: record("notify", () => "toast-1"),
  openOverlay: record("openOverlay", () => `overlay-${++env.overlays}`),
  closeOverlay: record("closeOverlay"),
  setShared: record("setShared", (k: string, v: unknown) => {
    env.shared[k] = v;
  }),
  hc: (args: string[]) => {
    env.calls.push({ fn: "hc", args: [args] });
    return Promise.resolve(env.hc(args));
  },
  exec: (cmd: string, args: string[], opts?: unknown) => {
    env.calls.push({ fn: "exec", args: [cmd, args] });
    return env.exec(cmd, args, opts);
  },
  shared: (k: string) => env.shared[k],
  props: () => env.props,
  spaces: () => env.spaces,
  panes: () => env.panes,
  terminals: () => env.terminals,
  machines: () => env.machines,
  focused: () => env.focused,
  layout: () => env.layout,
  keys: () => env.keys,
  theme: () => new Proxy({}, { get: (_t, k) => String(k) }),
  settings: () => ({ zoom: 1 }),
  window: () => ({ platform: "macos" }),
  home: () => "/home/dev",
  readTextFile: async (path: string) => env.files[path] ?? null,
  nextCommand: () =>
    env.commands.length ? Promise.resolve(env.commands.shift()) : new Promise(() => {}),
}));

// Herdr's fetch is a global; the stub records each request and answers from env.fetch.
(globalThis as any).fetch = (url: string, opts?: any) => {
  env.calls.push({ fn: "fetch", args: [url, opts?.method ?? "GET"] });
  return env.fetch(url, opts);
};

// A test that imports a module directly still finds every registration: reset() empties the
// registry and registers again, as main.js does when Herdr loads a copy of the mod.
{
  const registry = await import("../mods/bakers/core/registry.js");
  const main = await import("../mods/bakers/main.js");
  refill = () => {
    registry._resetForTests();
    main.registerAll();
  };
}

/** The requests sent with fetch, as decoded URLs. */
export function fetched(): string[] {
  return env.calls
    .filter((c) => c.fn === "fetch")
    .map((c) => decodeURIComponent(String(c.args[0]).replace(/\+/g, " ")));
}

/** A context stub: spawned tasks are kept so tests can await them with flush(). */
export function cx(): any {
  const c: any = {
    notified: 0,
    stopped: false,
    notify() {
      c.notified++;
    },
    stop_propagation() {
      c.stopped = true;
    },
    spawn(fn: (cx: any) => Promise<unknown>) {
      const p = Promise.resolve().then(() => fn(cx()));
      env.tasks.push(p);
      return p;
    },
    timer: {
      every(ms: number, fn: (cx: any) => void) {
        env.timers.push({ ms, fn, every: true });
      },
      after(ms: number, fn: (cx: any) => void) {
        env.timers.push({ ms, fn, every: false });
      },
    },
    focus_handle() {
      const h = {
        focused: false,
        focus() {
          h.focused = true;
        },
      };
      return h;
    },
    write_to_clipboard(text: string) {
      env.calls.push({ fn: "clipboard", args: [text] });
    },
  };
  return c;
}

/** Lets spawned tasks run: a number of macrotask turns (a command loop never settles). */
export async function flush(turns = 40) {
  for (let i = 0; i < turns; i++) await new Promise((r) => setTimeout(r, 0));
  env.tasks.length = 0;
}

/** Runs timers registered with cx.timer.after (and once each `every`). */
export function fireTimers(ms = Number.POSITIVE_INFINITY) {
  const due = env.timers.filter((t) => t.ms <= ms);
  env.timers = env.timers.filter((t) => t.every || t.ms > ms);
  for (const t of due) t.fn(cx());
}

/** Imports a mod file by its path under mods/. */
export async function load(path: string): Promise<any> {
  return (await import(new URL(`../mods/${path}`, import.meta.url).href)).default;
}

/** Makes a view the way Herdr does: constructor, then init(props, cx). */
export function mount(View: any, props: any = env.props): any {
  env.props = props;
  const view = new View(props);
  view.init?.(props, cx());
  return view;
}

const isEl = (n: unknown): n is any => typeof n === "object" && n !== null && "nodes" in n;

export function walk(root: any, visit: (n: any) => void) {
  if (!isEl(root)) return;
  visit(root);
  for (const n of root.nodes) walk(n, visit);
}

export function find(root: any, id: string): any {
  let hit: any;
  walk(root, (n) => {
    if (!hit && n.calls.id?.[0] === id) hit = n;
  });
  return hit;
}

/** Every text child, in order. */
export function texts(root: any): string[] {
  const out: string[] = [];
  const go = (n: unknown) => {
    if (typeof n === "string") out.push(n);
    else if (isEl(n)) n.nodes.forEach(go);
  };
  go(root);
  return out;
}

/** The innermost element with a text child equal to `text`. */
export function findText(root: any, text: string): any {
  let hit: any;
  walk(root, (n) => {
    if (n.nodes.includes(text)) hit = n;
  });
  return hit;
}

/** The nearest element (self or ancestor of the text) with a handler named `handler`. */
export function closest(root: any, text: string, handler = "on_click"): any {
  let hit: any;
  const go = (n: any, chain: any[]) => {
    if (!isEl(n)) return;
    const path = [...chain, n];
    if (n.nodes.includes(text)) {
      for (let i = path.length - 1; i >= 0 && !hit; i--) if (path[i].calls[handler]) hit = path[i];
    }
    n.nodes.forEach((c: any) => {
      go(c, path);
    });
  };
  go(root, []);
  return hit;
}

export function click(node: any, event: any = {}) {
  if (!node?.calls?.on_click) throw new Error("no on_click on node");
  const c = cx();
  node.calls.on_click[0]({ click_count: 1, modifiers: {}, ...event }, c);
  return c;
}

/** A key press on the node's on_key_down, e.g. key(root, "cmd-enter"). */
export function key(node: any, keystroke: string) {
  const parts = keystroke.split("-");
  const k = parts.pop() as string;
  const modifiers = {
    platform: parts.includes("cmd"),
    control: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    function: false,
  };
  const c = cx();
  node.calls.on_key_down[0](
    { key: k, keystroke, key_char: k.length === 1 ? k : undefined, modifiers },
    c,
  );
  return c;
}

/** The commands sent with run(), as [name, args] pairs. */
export function runs(): unknown[][] {
  return env.calls.filter((c) => c.fn === "run").map((c) => c.args);
}

/** The bakers tools called through exec, as [tool, args] pairs. */
export function tools(): [string, any][] {
  return env.calls
    .filter(
      (c) => c.fn === "exec" && c.args[0] === "bakers" && (c.args[1] as string[])[0] === "tools",
    )
    .map((c) => {
      const argv = c.args[1] as string[];
      return [argv[1], JSON.parse(argv[3])];
    });
}

export const TOKEN = {
  base_url: "https://bakers.test",
  token: "t0k3n",
  token_type: "Bearer",
  expires_at: "2099-01-01T00:00:00Z",
};

type Reply = unknown | Error | ((args: any) => unknown);

/** Answers `bakers tools <tool> --data <json>` as the CLI does: ["message", "<json>"]. */
export function cli(replies: Record<string, Reply>) {
  env.exec = async (_cmd, argv) => {
    if (argv[0] === "auth" && argv[1] === "token")
      return { code: 0, stdout: JSON.stringify(TOKEN), stderr: "" };
    const tool = argv[1];
    if (!(tool in replies))
      return {
        code: 4,
        stdout: "",
        stderr: JSON.stringify({
          error: { code: "E_VALIDATION", message: `unknown tool '${tool}'` },
        }),
      };
    let r = replies[tool];
    if (typeof r === "function") r = (r as (a: any) => unknown)(JSON.parse(argv[3]));
    if (r instanceof Error)
      return {
        code: 1,
        stdout: "",
        stderr: JSON.stringify({ error: { code: "E_TOOL", message: r.message } }),
      };
    return { code: 0, stdout: JSON.stringify(["Done.", JSON.stringify(r)]), stderr: "" };
  };
}
