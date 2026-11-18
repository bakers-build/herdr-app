// shell/controller/tabs: the bakers tab bar (view "tabs" in the layout's tabs block). Copied from Herdr's `tabs` mod, herdrdev/herdr-app v0.1.15
// defaults/mods/tabs/main.js (Apache-2.0); the panel memory per space, drag to move,
// rename on double-click, the tab menu and the window buttons are Herdr's.
// What differs, as drawn in the wireframe frames R2-4 and R2-3:
// - tabs are 26 px high, 10 px padding, 12 px text, 6 px corners, a 1 px border
//   (foreground on the active tab, which is also semibold), 6 px apart, in a 40 px bar;
// - the Tickets tab reads "Tickets <n>" with the needs-you count and stays at index 1;
// - the preview ticket tab (shared "bakers.preview") is italic;
// - a ticket tab whose ticket needs you (shared "bakers.needs") carries a 6 px dot in
//   the theme's blocked color;
// - the panel buttons are Files, Changes and Ticket (the bakers panel), as text.
// The window button icons are Herdr's own, mods/tabs/win-*.svg, shipped with every install.
import { div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, window, shared, layout, settings } from "herdr";
import { parseName, preview, reconcile } from "../../core/tabs.js";
import { tokens } from "../../ui/theme.js";

/** @param {any} node @param {string} id @returns {any} */
function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const storage = {
  /** @param {string} key */
  get(key) {
    try {
      return localStorage.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  /** @param {string} key @param {string} value */
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // per-copy memory only
    }
  },
};

export default class BakersTabs {
  /** @type {number | null} the tab a drag started on */
  pressed = null;
  /** @type {import("gpui-base").ScrollHandle} init makes it */
  scroll = /** @type {any} */ (null);
  /** @type {Record<string, string | null>} the open panel per space */
  panels = {};
  /** @type {string | undefined} the space last synced; undefined before the first */
  space = undefined;
  /** @type {{ want: string | null, until: number } | null} a panel switch on its way */
  pending = null;
  /** @type {string | undefined} */
  selected = undefined;
  /** @type {number | undefined} */
  selectedIndex = undefined;

  init() {
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(storage.get("panels") ?? "{}");
  }

  // The side panel is remembered per space (Herdr's tabs mod, unchanged).
  /** @param {any} space @param {any} panel @param {any} body @param {(string | null)[]} enabled */
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : (body?.active ?? null);
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id;
      this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null,
          want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) {
            run("layout.select", { stack: "panel-body", child: want });
            run("layout.show", { id: "panel" });
          } else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    storage.set("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = tokens();
    reconcile();
    const space = spaces().find((p) => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex((tab) => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const needs = /** @type {any} */ (shared("bakers.needs")) ?? { count: 0, ids: [] };
    const previewId = preview()?.id ?? null;
    const stop = (/** @type {unknown} */ _e, /** @type {import("gpui-kit").Context} */ cx) =>
      cx.stop_propagation();
    /** @param {string} id @param {any} label @param {(e: any, cx: import("gpui-kit").Context) => void} action */
    const button = (id, label, action) =>
      div()
        .id(id)
        .size(26)
        .flex_none()
        .flex()
        .items_center()
        .justify_center()
        .rounded(6)
        .text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop)
        .on_click(action)
        .child(label);
    /** @param {import("herdr").TabInfo} c @param {number} i */
    const item = (c, i) => {
      const ticket = parseName(c.name);
      const isTickets = c.name === "Tickets";
      const program =
        isTickets || ticket
          ? null
          : (panes().find((p) => p.tab === c.id && p.program?.agent)?.program ??
            panes().find((p) => p.tab === c.id)?.program);
      const plain = /^tb\d+$/.test(c.name) ? (program?.name ?? "Terminal") : c.name;
      const name = isTickets && needs.count ? `Tickets ${needs.count}` : plain;
      const asksYou = Boolean(ticket && needs.ids?.includes(ticket.id));
      return h_flex()
        .id(`tab-${c.id}`)
        .h(26)
        .px(10)
        .gap(6)
        .rounded(6)
        .items_center()
        .flex_none()
        .text_size(12)
        .when(i <= active, (el) =>
          el.on_size_change((_size, cx) => {
            this.scroll.scroll_to_item(active);
            cx.notify();
          }),
        )
        .border(1)
        .border_color(c.active ? t.foreground : t.border)
        .bg(t.surface)
        .text_color(c.active ? t.foreground : t.muted)
        .when(c.active, (el) => el.font_semibold())
        .when(Boolean(ticket) && ticket?.id === previewId, (el) => el.italic())
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          this.pressed = i;
          if (e.click_count === 2 && !ticket && !isTickets) run("tab.rename", { id: c.id });
        })
        .on_mouse_up("left", () => {
          const from = this.pressed;
          this.pressed = null;
          if (from !== null && from !== i)
            run("tab.move", {
              id: shown[from].id,
              index: shown.findIndex((x) => x.id === c.id) + 1,
            });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({
            mod: "menu",
            kind: "popup",
            width: 200,
            props: { tab: "tab", target: { id: c.id, space: space?.id } },
          });
        })
        .when(Boolean(program?.icon), (el) =>
          el.child(
            program?.tint
              ? svg(program.icon ?? "")
                  .size(14)
                  .text_color(t.muted)
              : image(program?.icon ?? "").size(14),
          ),
        )
        .child(
          div()
            .max_w(220)
            .truncate()
            .child(c.zoomed ? `${name} Z` : name),
        )
        .when(c.status === "working", (el) =>
          el.child(
            svg("mods/workspace-chrome/spinner.svg")
              .size(12)
              .flex_none()
              .text_color(t.working)
              .spin(900),
          ),
        )
        .when(asksYou, (el) =>
          el.child(div().id(`dot-${c.id}`).size(6).rounded(3).flex_none().bg(t.blocked)),
        )
        .when(!asksYou && (c.status === "blocked" || c.status === "done"), (el) =>
          el.child(
            div()
              .size(6)
              .rounded(3)
              .bg(c.status === "done" ? t.done : t.blocked),
          ),
        );
    };
    const root = /** @type {any} */ (layout()),
      sidebar = find(root, "sidebar"),
      w = window();
    const lightsPadding =
      w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
        ? Math.max(
            10,
            (root.traffic_lights[0] + 64) / Number(settings().zoom ?? 1) -
              (sidebar?.hidden ? 0 : (sidebar?.size?.px ?? 0)),
          )
        : 10;
    const panel = find(root, "panel"),
      body = find(root, "panel-body");
    const enabled = /** @type {string[]} */ (shared("workspace.panels")) ?? ["files", "changes"];
    this.syncPanel(space, panel, body, [...enabled, "ticket"]);
    /** @param {string} id @param {string} label @param {boolean} bordered */
    const panelButton = (id, label, bordered) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex()
        .id(`panel-${id}`)
        .h(26)
        .px(10)
        .flex_none()
        .items_center()
        .rounded(6)
        .text_size(12)
        .when(bordered, (el) =>
          el
            .border(1)
            .border_color(on ? t.foreground : t.border)
            .bg(t.surface),
        )
        .when(!bordered && on, (el) => el.bg(t.selected))
        .text_color(on ? t.foreground : t.muted)
        .when(Boolean(on), (el) => el.font_semibold())
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else {
            run("layout.select", { stack: "panel-body", child: id });
            run("layout.show", { id: "panel" });
          }
        })
        .child(label);
    };
    return h_flex()
      .size_full()
      .h(40)
      .min_w(0)
      .px(10)
      .pl(lightsPadding)
      .gap(6)
      .items_center()
      .bg(t.chrome)
      .border_b(1)
      .border_color(t.border)
      .on_mouse_up("left", () => {
        this.pressed = null;
      })
      .on_scroll_wheel((e) => {
        if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next");
      })
      .child(
        h_flex()
          .id("tab-scroll")
          .flex_1()
          .min_w(0)
          .h_full()
          .items_center()
          .gap(6)
          .overflow_x_scrollbar()
          .track_scroll(this.scroll)
          .on_size_change((_size, cx) => {
            if (active >= 0) {
              this.scroll.scroll_to_item(active);
              cx.notify();
            }
          })
          .children(shown.map(item))
          .child(
            button("tab-new", "+", () =>
              openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }),
            ),
          ),
      )
      .when(enabled.includes("files"), (el) => el.child(panelButton("files", "Files", false)))
      .when(enabled.includes("changes"), (el) => el.child(panelButton("changes", "Changes", false)))
      .child(panelButton("ticket", "Ticket", true))
      .when(Boolean(w?.buttons), (el) =>
        el
          .child(
            button(
              "minimize",
              w.platform === "windows" ? svg("mods/tabs/win-min.svg").size(16) : "−",
              () => run("window.minimize"),
            ),
          )
          .child(
            button(
              "maximize",
              w.platform === "windows"
                ? svg(`mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16)
                : "□",
              () => run("window.maximize"),
            ),
          )
          .child(
            button(
              "close-window",
              w.platform === "windows"
                ? svg("mods/tabs/win-close.svg").size(16)
                : svg("mods/pane/close.svg").size(13),
              () => run("window.close"),
            ),
          ),
      );
  }
}
