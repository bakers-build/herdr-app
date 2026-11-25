import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, readdir, rm, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "./harness";

const { bakersLayout, mergeKeys, BAKERS_KEYS } = await import("../scripts/layout.js");
const { install, herdrApp } = await import("../scripts/install");

const main = JSON.parse(
  await readFile(new URL("./fixtures/herdr-main.json", import.meta.url), "utf8"),
);

function find(node: any, id: string): any {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}
function parentOf(node: any, id: string): any {
  for (const c of node?.children ?? []) {
    if (c.id === id) return node;
    const f = parentOf(c, id);
    if (f) return f;
  }
  return null;
}
function ids(node: any, out: string[] = []) {
  if (node?.id) out.push(node.id);
  for (const c of node?.children ?? []) ids(c, out);
  return out;
}

let home = "";
afterEach(async () => {
  if (home) await rm(home, { recursive: true, force: true });
  home = "";
});

test("a 56 px rail block is the first child of root", () => {
  const l = bakersLayout(main);
  expect(l.children[0]).toEqual({
    id: "bakers-rail",
    type: "block",
    size: { px: 56 },
    resizable: false,
    content: { mod: "bakers", props: { view: "shell.rail" } },
  });
});

test("the sidebar is 220 px and hidden, and carries no bakers box", () => {
  const l = bakersLayout(main);
  const sidebar = find(l, "sidebar");
  expect(sidebar.size).toEqual({ px: 220 });
  expect(sidebar.hidden).toBe(true);
  expect(find(l, "bakers-sidebar")).toBeNull();
});

test("a layout that already carries the bakers box loses it; other blocks stay", () => {
  const withBox = structuredClone(main);
  const list = parentOf(withBox, "agents");
  const i = list.children.findIndex((c: any) => c.id === "agents");
  list.children.splice(i + 1, 0, {
    id: "bakers-sidebar",
    type: "block",
    size: { weight: 1 },
    min: 200,
    content: { mod: "bakers", props: { view: "shell.sidebar" } },
  });
  const l = bakersLayout(withBox);
  expect(find(l, "bakers-sidebar")).toBeNull();
  expect(ids(l)).toEqual(ids(bakersLayout(main)));
  expect(l).toEqual(bakersLayout(main));
});

test("the tab bar is the bakers view tabs at 40 px", () => {
  const tabs = find(bakersLayout(main), "tabs");
  expect(tabs.size).toEqual({ px: 40 });
  expect(tabs.content).toEqual({ mod: "bakers", props: { view: "shell.tabs" } });
});

test("the panel stack gains the ticket child; the panel stays 368 px and hidden", () => {
  const l = bakersLayout(main);
  const body = find(l, "panel-body");
  expect(body.children.map((c: any) => c.id)).toEqual(["files", "changes", "ticket"]);
  expect(find(l, "ticket").content).toEqual({ mod: "bakers", props: { view: "ticket.context" } });
  expect(find(l, "panel").size).toEqual({ px: 368 });
  expect(find(l, "panel").hidden).toBe(true);
});

const RUN_HEADER = {
  id: "run-header",
  type: "block",
  size: { px: 32 },
  resizable: false,
  content: { mod: "bakers", props: { view: "ticket.run" } },
};

test("the panel holds the hidden run column below panel-body, 1:1; work-body has none", () => {
  const l = bakersLayout(main);
  const panel = find(l, "panel");
  expect(panel.children.map((c: any) => c.id)).toEqual(["panel-body", "run"]);
  expect(find(l, "panel-body").size).toEqual({ weight: 1 });
  expect(find(l, "run")).toEqual({
    id: "run",
    type: "column",
    size: { weight: 1 },
    hidden: true,
    children: [RUN_HEADER],
  });
  expect(find(l, "work-body").children.map((c: any) => c.id)).toEqual(["main", "panel"]);
  expect(bakersLayout(l)).toEqual(l);
});

test("a run column left in work-body by an older version moves into the panel", () => {
  const old = structuredClone(main);
  const body = find(old, "work-body");
  body.children.splice(1, 0, {
    id: "run",
    type: "column",
    size: { weight: 1 },
    children: [RUN_HEADER, { id: "run-terminal", type: "block", content: { terminal: "t7" } }],
  });
  const l = bakersLayout(old);
  expect(find(l, "work-body").children.map((c: any) => c.id)).toEqual(["main", "panel"]);
  expect(find(l, "panel").children.map((c: any) => c.id)).toEqual(["panel-body", "run"]);
  expect(find(l, "run").hidden).toBe(true);
  expect(find(l, "run").children).toEqual([RUN_HEADER]);
});

test("the status row holds Herdr's status and the bakers status item", () => {
  const l = bakersLayout(main);
  const row = find(l, "status-row");
  expect(row.type).toBe("row");
  expect(row.size).toEqual({ px: 28 });
  expect(row.children.map((c: any) => c.id)).toEqual(["status", "bakers-status"]);
  expect(find(l, "status").content).toEqual({ mod: "workspace-status" });
  expect(find(l, "bakers-status").content).toEqual({
    mod: "bakers",
    props: { view: "shell.status" },
  });
});

test("panes are framed with 8 px corners as drawn", () => {
  expect(find(bakersLayout(main), "main").content.pane.radius).toBe(8);
});

test("ids are unique and every other block is unchanged", () => {
  const l = bakersLayout(main);
  const all = ids(l);
  expect(new Set(all).size).toBe(all.length);
  for (const id of ["spaces", "agents", "brand", "sidebar-footer", "files", "changes"])
    expect(find(l, id)).toEqual(find(main, id));
  expect(main.children[0].id).toBe("sidebar");
});

test("the transform is idempotent", () => {
  const once = bakersLayout(main);
  expect(bakersLayout(once)).toEqual(once);
});

test("mergeKeys adds the bakers keys and never overwrites", () => {
  const { keys, conflicts } = mergeKeys({
    global: { "cmd-shift-o": "pane.split:right", "cmd-b": "layout.toggle:sidebar" },
  });
  expect(keys.global["cmd-shift-o"]).toBe("pane.split:right");
  expect(keys.global["cmd-shift-t"]).toBe("bakers.panel");
  expect(keys.global["cmd-shift-b"]).toBe("bakers.tickets");
  expect(keys.global["cmd-shift-n"]).toBe("bakers.new");
  expect(keys.global["cmd-b"]).toBe("layout.toggle:sidebar");
  expect(conflicts).toEqual(["cmd-shift-o is pane.split:right, not bakers.goto"]);
  expect(BAKERS_KEYS["cmd-shift-o"]).toBe("bakers.goto");
  expect(BAKERS_KEYS["cmd-k"]).toBe("bakers.actions");
  expect(keys.global["cmd-k"]).toBe("bakers.actions");
  expect(mergeKeys(keys).keys).toEqual(keys);
});

test("install copies the mods, writes the bakers layout and merges keys; --dry-run writes nothing", async () => {
  home = await mkdtemp(join(tmpdir(), "herdr-home-"));
  await mkdir(join(home, "layouts"), { recursive: true });
  await writeFile(join(home, "layouts", "main.json"), JSON.stringify(main));
  await writeFile(
    join(home, "keys.json"),
    JSON.stringify({ global: { "cmd-shift-o": "pane.split:right" } }),
  );
  const lines: string[] = [];
  const dry = await install({
    home,
    herdr: fakeHerdr().run,
    dryRun: true,
    log: (l: string) => lines.push(l),
  });
  expect(lines[0]).toBe("would install bakers 0.0.0-dev");
  expect(lines.at(-1)).toEndWith("(bakers 0.0.0-dev)");
  expect(dry.version).toBe("0.0.0-dev");
  expect(dry.written).toEqual([]);
  expect(dry.conflicts).toEqual(["cmd-shift-o is pane.split:right, not bakers.goto"]);
  lines.length = 0;
  const done = await install({
    home,
    herdr: fakeHerdr().run,
    dryRun: false,
    log: (l: string) => lines.push(l),
  });
  expect(lines[0]).toBe("installing bakers 0.0.0-dev");
  expect(lines.at(-1)).toEndWith("(bakers 0.0.0-dev)");
  expect(done.written).toContain(join(home, "layouts", "bakers.json"));
  const layout = JSON.parse(await readFile(join(home, "layouts", "bakers.json"), "utf8"));
  expect(find(layout, "bakers-rail")).toBeDefined();
  const keys = JSON.parse(await readFile(join(home, "keys.json"), "utf8"));
  expect(keys.global["cmd-shift-t"]).toBe("bakers.panel");
  expect(keys.global["cmd-shift-o"]).toBe("pane.split:right");
  expect(await readFile(join(home, "mods", "bakers", "main.js"), "utf8")).toContain(
    "export function registerAll",
  );
  expect(
    await readFile(join(home, "mods", "bakers", "shell", "view", "tabs.js"), "utf8"),
  ).toContain("bakers tab bar");
  const again = await install({ home, herdr: fakeHerdr().run, dryRun: false, log: () => {} });
  expect(again.written.filter((p: string) => !p.includes("/mods/"))).toEqual([]);
});

type Call = { args: string[]; detach: boolean };
/** A recording herdr-app: `status` answers 0 for the first `runningFor` calls, then 1. */
function fakeHerdr(runningFor = 0, statusOut = "") {
  const calls: Call[] = [];
  let statuses = 0;
  const run = async (args: string[], opts: { detach?: boolean } = {}) => {
    calls.push({ args, detach: !!opts.detach });
    if (args[0] === "status") {
      statuses++;
      if (statusOut) return { code: 1, out: statusOut };
      return statuses <= runningFor
        ? { code: 0, out: "window: bakers" }
        : { code: 1, out: "herdr-app: no Herdr window at x.sock: No such file or directory" };
    }
    return { code: 0, out: "" };
  };
  return { run, calls };
}

async function freshHome() {
  home = await mkdtemp(join(tmpdir(), "herdr-home-"));
  await mkdir(join(home, "layouts"), { recursive: true });
  await writeFile(join(home, "layouts", "main.json"), JSON.stringify(main));
  return home;
}

async function files(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await files(dir, r)));
    else out.push(r);
  }
  return out.sort();
}

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

test("install removes stale mod files and keeps the files Herdr generates", async () => {
  await freshHome();
  const mod = join(home, "mods", "bakers");
  await mkdir(join(mod, "shell", "view"), { recursive: true });
  await mkdir(join(mod, "ticket", "controller"), { recursive: true });
  await mkdir(join(mod, "ui"), { recursive: true });
  await writeFile(join(mod, "shell", "view", "sidebar.js"), "// stale\n");
  await writeFile(join(mod, "ticket", "controller", "x.js"), "// stale\n");
  await writeFile(join(mod, "gpui-kit.d.ts"), "// generated\n");
  await writeFile(join(mod, "ui", "gpui-kit.d.ts"), "// generated\n");
  await writeFile(join(mod, "jsconfig.json"), "{}\n");

  const lines: string[] = [];
  const dry = await install({
    home,
    herdr: fakeHerdr().run,
    dryRun: true,
    log: (l) => lines.push(l),
  });
  expect(dry.written).toEqual([]);
  expect(lines).toContain("would remove mods/bakers/shell/view/sidebar.js");
  expect(await exists(join(mod, "shell", "view", "sidebar.js"))).toBe(true);

  await install({ home, herdr: fakeHerdr().run, log: () => {} });
  expect(await exists(join(mod, "shell", "view", "sidebar.js"))).toBe(false);
  expect(await exists(join(mod, "ticket", "controller"))).toBe(false);
  const repo = await files(fileURLToPath(new URL("../mods/bakers", import.meta.url)));
  const generated = ["gpui-kit.d.ts", "jsconfig.json", "ui/gpui-kit.d.ts"];
  expect(await files(mod)).toEqual([...new Set([...repo, ...generated])].sort());
});

test("install into a running Herdr quits it, installs, then starts it again", async () => {
  await freshHome();
  const herdr = fakeHerdr(2);
  const lines: string[] = [];
  let layoutAtStart: string | null = null;
  const run = async (args: string[], opts: { detach?: boolean } = {}) => {
    if (opts.detach)
      layoutAtStart = await readFile(join(home, "layouts", "bakers.json"), "utf8").catch(
        () => null,
      );
    return herdr.run(args, opts);
  };
  await install({ home, herdr: run, pollMs: 1, platform: "darwin", log: (l) => lines.push(l) });
  expect(herdr.calls).toEqual([
    { args: ["status"], detach: false },
    { args: ["do", "app.quit"], detach: false },
    { args: ["status"], detach: false },
    { args: ["status"], detach: false },
    { args: [], detach: true },
  ]);
  expect(layoutAtStart).not.toBeNull();
  expect(lines).toContain("Herdr is running: quitting it to install (terminals keep running)");
  expect(lines).toContain("started Herdr again");
});

test("an install that fails after the quit still starts Herdr again", async () => {
  home = await mkdtemp(join(tmpdir(), "herdr-home-"));
  const herdr = fakeHerdr(1);
  await expect(
    install({ home, herdr: herdr.run, pollMs: 1, platform: "darwin", log: () => {} }),
  ).rejects.toThrow("no layouts/main.json");
  expect(herdr.calls[1]).toEqual({ args: ["do", "app.quit"], detach: false });
  expect(herdr.calls.at(-1)).toEqual({ args: [], detach: true });
});

test("a start that fails says so instead of claiming Herdr started", async () => {
  await freshHome();
  const herdr = fakeHerdr(1);
  const run = async (args: string[], opts: { detach?: boolean } = {}) =>
    opts.detach ? { code: 127, out: "herdr-app: not found" } : herdr.run(args, opts);
  const lines: string[] = [];
  await install({ home, herdr: run, pollMs: 1, log: (l) => lines.push(l) });
  expect(lines).not.toContain("started Herdr again");
  expect(lines).toContain("could not start Herdr (herdr-app: not found): run herdr-app");
});

test("a mod folder the installer cannot read stops the install", async () => {
  await freshHome();
  const locked = join(home, "mods", "bakers", "old");
  await mkdir(locked, { recursive: true });
  await writeFile(join(locked, "x.js"), "// stale\n");
  await chmod(locked, 0o000);
  try {
    await expect(install({ home, herdr: fakeHerdr().run, log: () => {} })).rejects.toThrow(
      "EACCES",
    );
  } finally {
    await chmod(locked, 0o755);
  }
});

test("a herdr-app call that does not return is killed and counts as not answering", async () => {
  const slow = herdrApp(home || tmpdir(), ["bun", "-e", "await Bun.sleep(5000)"], 100);
  const started = Date.now();
  const r = await slow(["status"]);
  expect(Date.now() - started).toBeLessThan(2000);
  expect(r.code).not.toBe(0);
});

test("on Linux a running Herdr is quit with window.close", async () => {
  await freshHome();
  const herdr = fakeHerdr(1);
  await install({ home, herdr: herdr.run, pollMs: 1, platform: "linux", log: () => {} });
  expect(herdr.calls[1]).toEqual({ args: ["do", "window.close"], detach: false });
});

test("a Herdr that does not quit stops the install before anything is written", async () => {
  await freshHome();
  const herdr = fakeHerdr(1000);
  await expect(
    install({ home, herdr: herdr.run, pollMs: 1, timeoutMs: 20, log: () => {} }),
  ).rejects.toThrow("Herdr did not quit; quit it and run again");
  expect(await exists(join(home, "mods"))).toBe(false);
  expect(await exists(join(home, "layouts", "bakers.json"))).toBe(false);
});

test("an install that cannot reach Herdr stops before anything is written", async () => {
  await freshHome();
  const out = "herdr-app: no Herdr window at x.sock: Operation not permitted (os error 1)";
  await expect(install({ home, herdr: fakeHerdr(0, out).run, log: () => {} })).rejects.toThrow(
    `cannot reach Herdr (${out}): run the installer outside a sandbox`,
  );
  expect(await exists(join(home, "mods"))).toBe(false);
  expect(await exists(join(home, "layouts", "bakers.json"))).toBe(false);
});

test("with Herdr not running the installer only asks for its status", async () => {
  await freshHome();
  const herdr = fakeHerdr(0);
  const lines: string[] = [];
  await install({ home, herdr: herdr.run, log: (l) => lines.push(l) });
  expect(herdr.calls).toEqual([{ args: ["status"], detach: false }]);
  expect(await exists(join(home, "mods", "bakers", "main.js"))).toBe(true);
  expect(await exists(join(home, "layouts", "bakers.json"))).toBe(true);
  expect(await exists(join(home, "keys.json"))).toBe(true);
  expect(lines.some((l) => l.includes("Herdr"))).toBe(false);
});

test("a dry run into a running Herdr neither quits nor starts it and writes nothing", async () => {
  await freshHome();
  const herdr = fakeHerdr(5);
  const lines: string[] = [];
  const dry = await install({ home, herdr: herdr.run, dryRun: true, log: (l) => lines.push(l) });
  expect(herdr.calls).toEqual([{ args: ["status"], detach: false }]);
  expect(dry.written).toEqual([]);
  expect(lines).toContain("would quit Herdr, install and start it again");
  expect(await exists(join(home, "mods"))).toBe(false);
});
