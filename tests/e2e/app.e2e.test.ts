// The bakers mod in the real Herdr window against the seeded bakers server, nothing stubbed.
// Runs only from tests/e2e/run.ts (bun run test:e2e), which starts both and sets BAKERS_E2E_*;
// a plain `bun test` skips it. Observes no pixels: `herdr-app ls`/`status` and the window's
// shared.json, which Herdr writes from the mod's shared state.
import { describe, expect, test } from "bun:test";
import {
  herdrCli,
  keyedTicket,
  layoutName,
  readShared,
  statusErrors,
  tabNames,
  ticketTabPattern,
  waitFor,
} from "./herdr";

const HOME = process.env.BAKERS_E2E_HOME ?? "";
const URL = process.env.BAKERS_E2E_URL ?? "";
const KEY = process.env.BAKERS_E2E_KEY ?? "";
const PROJECT = process.env.BAKERS_E2E_PROJECT ?? "";
const BIN = process.env.HERDR_APP ?? "herdr-app";
const env = process.env;

const herdr = (...args: string[]) => herdrCli(BIN, env, ...args);
function run(command: string, args: object) {
  const r = herdr("do", command, JSON.stringify(args));
  if (r.code !== 0) throw new Error(`herdr-app do ${command}: ${r.text}`);
  return r.json;
}

/** The seeded project's open tickets as the server returns them: identifier → state. */
async function openTickets(): Promise<Map<string, string>> {
  const sep = KEY.indexOf(":");
  const t = await fetch(`${URL}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: KEY.slice(0, sep),
      client_secret: KEY.slice(sep + 1),
    }),
  });
  if (!t.ok) throw new Error(`token: HTTP ${t.status}`);
  const { access_token } = (await t.json()) as any;
  const q = new URLSearchParams({
    "filter[p][condition][path]": "project_id.id",
    "filter[p][condition][value]": PROJECT,
    "filter[c][condition][path]": "closed",
    "filter[c][condition][value]": "0",
    "page[limit]": "50",
  });
  const tickets = new Map<string, string>();
  let next: string | null = `${URL}/jsonapi/bb_ticket/bb_ticket?${q}`;
  while (next) {
    const r = await fetch(next, {
      headers: { Authorization: `Bearer ${access_token}`, Accept: "application/vnd.api+json" },
    });
    if (!r.ok) throw new Error(`tickets: HTTP ${r.status}`);
    const doc: any = await r.json();
    for (const d of doc.data) tickets.set(d.attributes.identifier, d.attributes.state);
    next = doc.links?.next?.href ?? null;
  }
  return tickets;
}

describe.skipIf(!HOME)("the bakers mod in the real Herdr window", () => {
  let open = new Map<string, string>();
  let selected = "";

  test("opens the Tickets tab in the bakers layout", async () => {
    run("tab.new", { mod: "bakers", props: { view: "ticket.list" }, name: "Tickets" });
    await waitFor(
      async () => (tabNames(herdr("ls").json).includes("Tickets") ? true : null),
      30_000,
      "the Tickets tab in herdr-app ls",
    );
    const status = herdr("status").json;
    expect(layoutName(status)).toBe("bakers");
    expect(statusErrors(status)).toEqual([]);
  });

  test("lists the seeded project's open tickets", async () => {
    open = await openTickets();
    expect(open.size).toBeGreaterThan(0);
    selected = await waitFor(
      async () => {
        const id = readShared(HOME)["bakers.selected"];
        return typeof id === "string" && open.has(id) ? id : null;
      },
      60_000,
      `bakers.selected in shared.json to be one of ${[...open.keys()].join(", ")}`,
    );
    // The window task publishes it after the same load, possibly a moment later.
    await waitFor(
      async () => {
        const needs: any = readShared(HOME)["bakers.needs"];
        return typeof needs?.updated === "number" ? true : null;
      },
      70_000,
      "bakers.needs.updated in shared.json",
    );
  });

  test('opens a ticket as "<ID> <state>"', async () => {
    expect(selected).not.toBe("");
    // The mod names a tab "<ID> <state>" only for identifiers its tab pattern keys (PROJECT-N);
    // the seed also has others (GL-E2E-DERIVE), whose tab it leaves as opened.
    const id = keyedTicket([...open.keys()], selected, ticketTabPattern());
    if (!id) throw new Error(`no open seed ticket the mod names a tab after: ${[...open.keys()]}`);
    const want = `${id} ${open.get(id)}`;
    run("tab.new", {
      mod: "bakers",
      props: { view: "ticket.view", ticket: id },
      name: `${id} opening`,
    });
    await waitFor(
      async () => (tabNames(herdr("ls").json).includes(want) ? true : null),
      90_000,
      `the tab "${want}" in herdr-app ls`,
    );
    expect(statusErrors(herdr("status").json)).toEqual([]);
  });
});
