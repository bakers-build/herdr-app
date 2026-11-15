// The acme-shop project of the wireframe frames, served by a fake bakers CLI.
import { cli, env } from "../harness";

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

export function backend(extra: Record<string, unknown> = {}) {
  cli({
    bakers_project_read: (a: any) =>
      a.project === "ACMESHOP"
        ? { uuid: "p1", key: "ACMESHOP", name: "acme-shop" }
        : new Error(`Project ${a.project} does not exist`),
    bakers_ticket_list: { tickets: list, next_offset: null },
    bakers_ticket_read: (a: any) => {
      const row = list.find((t) => t.id === a.ticket || t.identifier === a.ticket);
      return { ...row, comments: [], ...(read[row?.id ?? ""] ?? {}) };
    },
    bakers_ticket_runs_list: (a: any) =>
      a.ticket === "u41"
        ? {
            runs: [
              {
                uuid: "r1",
                state: "running",
                agent: "claude",
                started_at: Math.floor(NOW / 1000) - 3600,
                closed: false,
              },
            ],
          }
        : { runs: [] },
    ...extra,
  });
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
