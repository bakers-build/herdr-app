// The acme-shop project of the wireframe frames, served by a fake bakers CLI.
import { cli, env, flush, load, mount } from "../harness";
import { jsonapiServer, ref, type Resource } from "./jsonapi-server";

export const NOW = Date.now();
const ago = (min: number) => new Date(NOW - min * 60000).toISOString();
export const list = [
  {
    id: "u41",
    identifier: "SHOP-41",
    title: "Checkout fails with an empty cart",
    state: "working",
    labels: ["Question", "checkout"],
    frozen: true,
    frozen_at: ago(35),
    closed: false,
  },
  {
    id: "u56",
    identifier: "SHOP-56",
    title: "Show delivery date on the product page",
    state: "plan",
    labels: [],
    frozen: false,
    closed: false,
  },
  {
    id: "u57",
    identifier: "SHOP-57",
    title: "Q one",
    state: "qualification",
    labels: [],
    frozen: false,
    closed: false,
  },
  {
    id: "u58",
    identifier: "SHOP-58",
    title: "W one",
    state: "working",
    labels: [],
    frozen: false,
    closed: false,
  },
  {
    id: "u59",
    identifier: "SHOP-59",
    title: "W two",
    state: "working",
    labels: [],
    frozen: false,
    closed: false,
  },
  {
    id: "u60",
    identifier: "SHOP-60",
    title: "Q two",
    state: "qualification",
    labels: [],
    frozen: false,
    closed: false,
  },
  {
    id: "u49",
    identifier: "SHOP-49",
    title: "Old",
    state: "done",
    labels: [],
    frozen: false,
    closed: true,
  },
];
export const read: Record<string, any> = {
  u41: {
    type: "bug",
    recipe: "matt",
    conductor: "c1",
    branch_name: "shop-41-checkout-empty-cart",
    parent: null,
    links: [{ uri: "https://git.example/acme/shop/merge_requests/91", title: "MR !91" }],
    description:
      "Placing an order with an empty cart returns a 500 instead of a friendly page. Reported by support three times this week.\n\n**Acceptance**\n\n- An empty cart never reaches the checkout controller.\n- The customer sees a page, not an error.",
    comments: [
      {
        id: "c1",
        type: "qualification",
        author: "Claude Code",
        created: ago(120),
        body: "Reproduced: POST /checkout with the id of an empty cart returns 500 from CheckoutController::start.",
      },
      {
        id: "c2",
        type: "comment",
        author: "You",
        created: ago(60),
        body: "Agreed, fix it in the checkout controller, not in the cart.",
      },
      {
        id: "c3",
        type: "question",
        author: "Claude Code",
        created: ago(35),
        body: "Should an empty cart redirect to the shop home, or show the empty-cart page with suggestions?",
      },
    ],
  },
  u56: {
    comments: [
      {
        id: "p1",
        type: "plan",
        author: "Claude Code",
        created: ago(12),
        body: "## Plan\n\nShow the date.",
      },
    ],
  },
};

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * The project as JSON:API resources, as the bakers server serves them.
 * @param o tickets, activity, conductors or projects to use instead of the defaults
 */
export function resources(
  o: {
    tickets?: any[];
    activity?: any[];
    conductors?: any[];
    projects?: any[];
    users?: any[];
  } = {},
): Resource[] {
  const tickets = o.tickets ?? list;
  const out: Resource[] = [];
  for (const p of o.projects ?? [{ id: "p1", name: "acme-shop", key: "ACMESHOP" }])
    out.push({
      type: "bb_project--bb_project",
      id: p.id,
      attributes: { name: p.name, key: p.key },
    });
  const terms = new Map<string, Resource>();
  const term = (bundle: string, name: string) => {
    const id = `${bundle}-${name}`;
    if (!terms.has(id)) terms.set(id, { type: `bb_term--${bundle}`, id, attributes: { name } });
    return ref(`bb_term--${bundle}`, id);
  };
  for (const t of tickets) {
    const extra = read[t.id] ?? {};
    const comments = extra.comments ?? [];
    const runs =
      t.id === "u41"
        ? [
            {
              id: "r1",
              state: "running",
              agent: "claude",
              started_at: iso(NOW - 3600000),
              closed: false,
            },
          ]
        : (t.runs ?? []);
    for (const c of comments)
      out.push({
        type: "bb_comment--bb_comment",
        id: c.id,
        attributes: {
          bb_comment_type: c.type,
          body: { value: c.body, format: "bb_rich" },
          created: c.created,
          author_name: c.author,
        },
        relationships: { ticket_id: { data: ref("bb_ticket--bb_ticket", t.id) } },
      });
    for (const r of runs)
      out.push({
        type: "bb_run--bb_run",
        id: r.id,
        attributes: { state: r.state, agent: r.agent, started_at: r.started_at, closed: r.closed },
        relationships: { ticket_id: { data: ref("bb_ticket--bb_ticket", t.id) } },
      });
    out.push({
      type: "bb_ticket--bb_ticket",
      id: t.id,
      attributes: {
        identifier: t.identifier,
        title: t.title,
        state: t.state,
        workflow: "bb_work",
        frozen: Boolean(t.frozen),
        frozen_at: t.frozen_at ?? null,
        closed: Boolean(t.closed),
        closed_date: t.closed ? iso(NOW - 2 * 86400000) : null,
        changed: iso(NOW - 60000),
        description: { value: extra.description ?? "", format: "bb_rich" },
        branch_name: extra.branch_name ?? null,
        links: extra.links ?? [],
        assignee_name: t.assignee_name ?? null,
        claim_machine: t.claim_machine ?? null,
      },
      relationships: {
        project_id: { data: ref("bb_project--bb_project", t.project ?? "p1") },
        labels: { data: (t.labels ?? []).map((l: string) => term("label", l)) },
        ticket_type: { data: extra.type ? term("type", extra.type) : null },
        recipe: { data: extra.recipe ? term("recipe", extra.recipe) : null },
        conductor_id: {
          data: extra.conductor ? ref("bb_conductor--bb_conductor", extra.conductor) : null,
        },
        parent_id: { data: null },
        reviewers: { data: [] },
        comments: { data: comments.map((c: any) => ref("bb_comment--bb_comment", c.id)) },
        runs: { data: runs.map((r: any) => ref("bb_run--bb_run", r.id)) },
      },
    });
  }
  out.push(...terms.values());
  for (const c of o.conductors ?? [{ id: "c1", label: "studio-mac conductor", status: "online" }])
    out.push({
      type: "bb_conductor--bb_conductor",
      id: c.id,
      attributes: { label: c.label, status: c.status ?? "online", node_load_label: c.load ?? null },
      relationships: {
        project_id: { data: ref("bb_project--bb_project", "p1") },
        machine: { data: c.machine ? ref("bb_machine--bb_machine", `m-${c.id}`) : null },
      },
    });
  for (const c of o.conductors ?? [])
    if (c.machine)
      out.push({
        type: "bb_machine--bb_machine",
        id: `m-${c.id}`,
        attributes: { label: c.machine },
      });
  for (const a of o.activity ?? [])
    out.push({
      type: "bb_activity--bb_activity",
      id: a.id,
      attributes: {
        kind: a.kind,
        previous_state: a.previous_state ?? null,
        new_state: a.new_state ?? null,
        step: a.step ?? null,
        created: a.created,
      },
      relationships: {
        ticket_id: { data: ref("bb_ticket--bb_ticket", a.ticket ?? "u41") },
        actor: { data: null },
      },
    });
  for (const u of o.users ?? [{ id: "u-me", display_name: "Pascal Glass" }])
    out.push({
      type: "user--user",
      id: u.id,
      attributes: { display_name: u.display_name },
    });
  return out;
}

/**
 * Serves the project over the fake JSON:API server and answers the CLI's writes.
 * @param extra tool replies for writes (bakers_*), and `jsonapi` overrides for reads
 */
export function backend(extra: Record<string, any> = {}) {
  const { jsonapi, ...tools } = extra;
  cli(tools);
  // Built per request, so a test may change the data between requests.
  env.fetch = (url: string, opts?: any) =>
    jsonapiServer(resources(jsonapi ?? {}), undefined, "u-me")(url, opts);
}

export function activeSpace(folder = "/work/acme-shop") {
  env.spaces = [
    {
      id: "s1",
      name: "acme-shop",
      folder,
      active: true,
      tabs: [{ id: "t0", name: "Tickets", index: 1, active: true }],
    },
  ];
  env.files[`${folder}/.bakers/project.config.js`] =
    "export default {\n  schema_version: 1,\n  project: { name: 'acme-shop' },\n};\n";
}

/** A live run terminal, as herdr-core labels the conductor's: local `t7` or remote `vps/t7`. */
export const live = (address: string, id = "SHOP-41", extra: any = {}) => ({
  address,
  state: "live",
  labels: { "bakers.ticket": id, "bakers.run": "3" },
  program: { name: "Claude Code" },
  ...extra,
});

/** A ticket tab on the given ticket, loaded. */
export async function ticketTab(id = "SHOP-41", extra: Record<string, unknown> = {}) {
  activeSpace();
  backend(extra);
  env.spaces[0].tabs.push({ id: "t5", name: `${id} working`, index: 2, active: true });
  const Bakers = await load("bakers/main.js");
  const copy = mount(Bakers, { view: "ticket.view", ticket: id });
  await flush();
  return copy;
}

const projectData: any = await import("../../mods/bakers/project/state.js");
const ticketData: any = await import("../../mods/bakers/ticket/store.js");
const tabsModel: any = await import("../../mods/bakers/core/tabs.js");
const api: any = await import("../../mods/bakers/core/api.js");
const runColumn: any = await import("../../mods/bakers/ticket/terminal.js");

/** Forgets the window's project, store, pending tabs and API session between tests. */
export function resetMod() {
  api._resetForTests();
  projectData._resetForTests();
  ticketData._resetForTests();
  tabsModel._resetForTests();
  runColumn._resetForTests();
}
