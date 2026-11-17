import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "./harness";

const { bakersLayout, mergeKeys, BAKERS_KEYS } = await import("../scripts/layout.js");
const { install } = await import("../scripts/install");

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

test("the sidebar is 220 px and hidden, with the bakers section after agents", () => {
  const l = bakersLayout(main);
  const sidebar = find(l, "sidebar");
  expect(sidebar.size).toEqual({ px: 220 });
  expect(sidebar.hidden).toBe(true);
  const list = parentOf(l, "agents");
  const i = list.children.findIndex((c: any) => c.id === "agents");
  expect(list.children[i + 1]).toMatchObject({
    id: "bakers-sidebar",
    content: { mod: "bakers", props: { view: "shell.sidebar" } },
  });
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
  const dry = await install({ home, dryRun: true, log: (l: string) => lines.push(l) });
  expect(lines[0]).toBe("would install bakers 0.0.0-dev");
  expect(lines.at(-1)).toEndWith("(bakers 0.0.0-dev)");
  expect(dry.version).toBe("0.0.0-dev");
  expect(dry.written).toEqual([]);
  expect(dry.conflicts).toEqual(["cmd-shift-o is pane.split:right, not bakers.goto"]);
  lines.length = 0;
  const done = await install({ home, dryRun: false, log: (l: string) => lines.push(l) });
  expect(lines[0]).toBe("installing bakers 0.0.0-dev");
  expect(lines.at(-1)).toEndWith("(bakers 0.0.0-dev)");
  expect(done.written).toContain(join(home, "layouts", "bakers.json"));
  const layout = JSON.parse(await readFile(join(home, "layouts", "bakers.json"), "utf8"));
  expect(find(layout, "bakers-rail")).toBeDefined();
  const keys = JSON.parse(await readFile(join(home, "keys.json"), "utf8"));
  expect(keys.global["cmd-shift-t"]).toBe("bakers.panel");
  expect(keys.global["cmd-shift-o"]).toBe("pane.split:right");
  expect(await readFile(join(home, "mods", "bakers", "main.js"), "utf8")).toContain(
    "export const ROUTES",
  );
  expect(
    await readFile(join(home, "mods", "bakers", "shell", "controller", "tabs.js"), "utf8"),
  ).toContain("bakers tab bar");
  const again = await install({ home, dryRun: false, log: () => {} });
  expect(again.written.filter((p: string) => !p.includes("/mods/"))).toEqual([]);
});
