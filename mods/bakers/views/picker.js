// Popups: a menu (items carry lib/actions.js actions), the state menu (frame 4), the
// label picker, the conductor picker (R3-2) and the project picker. Up, Down, Enter and
// Esc as in Herdr's menu mod. Choosing never writes a state, freeze, move or cancel:
// those open their confirm dialog.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { closeOverlay, props, theme } from "herdr";
import { perform } from "../lib/actions.js";
import { api, currentProject, getStore, projectChoices, ready } from "../lib/context.js";
import { openConfirm } from "../lib/overlay.js";
import { chip, UI_FONT } from "../lib/theme.js";

const ALL_STATES = ["qualification", "plan", "working", "review", "done", "cancelled"];
const cap = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);

export default class Picker {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = 0;
    this.conductors = null;
    this.conductorsServed = true;
    this.input = InputState.new({ placeholder: "Label name" });
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (_e, cx) => this.addLabel(this.input.value(), cx));
    const p = props() ?? {};
    if (p.kind === "labels") this.input.focus();
    if (p.kind === "conductor")
      cx.spawn(async (cx) => {
        try {
          const project = await ready();
          this.conductors = await api.listConductors(project?.uuid ?? getStore().project);
        } catch (/** @type {any} */ e) {
          this.conductors = [];
          this.conductorsServed = !e?.unknownTool;
        }
        cx.notify();
      });
  }

  close() {
    closeOverlay(props().overlay);
  }

  /** @returns {{ key: string, label: string, note?: string, current?: boolean, disabled?: boolean, separator?: boolean, sub?: boolean, sublabel?: string, run: (cx: any) => void }[]} */
  items() {
    const p = props() ?? {};
    if (p.kind === "menu")
      return (p.items ?? []).map((/** @type {any} */ it, /** @type {number} */ i) => ({
        ...it,
        key: String(i),
        run: (/** @type {any} */ cx) => {
          this.close();
          perform(it.action, cx);
        },
      }));
    if (p.kind === "state")
      return ALL_STATES.map((s) => ({
        key: s,
        label: s === p.current ? cap(s) : `${cap(s)}...`,
        current: s === p.current,
        disabled: s === p.current,
        run: () => {
          this.close();
          openConfirm("state", { ticket: p.ticket, from: p.current, to: s });
        },
      }));
    if (p.kind === "conductor")
      return (this.conductors ?? []).map((/** @type {any} */ c) => ({
        key: c.uuid ?? c.id,
        label: c.name ?? c.uuid,
        sublabel: c.machine ?? "",
        run: () => {
          this.close();
          openConfirm("move", {
            ticket: p.ticket,
            conductor: c.uuid ?? c.id,
            name: c.name ?? c.uuid,
          });
        },
      }));
    if (p.kind === "project")
      return projectChoices().map((pr) => ({
        key: pr.uuid,
        label: pr.name,
        current: pr.uuid === currentProject()?.uuid,
        run: (/** @type {any} */ cx) => {
          this.close();
          perform(["project", pr.uuid, pr.name], cx);
        },
      }));
    if (p.kind === "labels") {
      const q = this.input.value().trim().toLowerCase();
      const known = new Set();
      for (const t of getStore().tickets) for (const l of t.labels ?? []) known.add(l);
      return [...known]
        .filter((l) => !q || l.toLowerCase().includes(q))
        .sort()
        .map((l) => ({ key: l, label: l, run: (/** @type {any} */ cx) => this.addLabel(l, cx) }));
    }
    return [];
  }

  /** @param {string} name @param {any} cx */
  addLabel(name, cx) {
    const label = name.trim();
    if (!label) return;
    this.close();
    cx.spawn(async () => {
      await perform(["labels", props().ticket, { labels_add: [label] }], cx);
    });
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const items = this.items();
    const choosable = items.filter((i) => !i.disabled);
    const row = (/** @type {any} */ it) => {
      const hot = choosable[this.at] === it;
      return h_flex()
        .id(`pick-${it.key}`)
        .px(8)
        .py(6)
        .gap(8)
        .rounded(4)
        .justify_between()
        .when(Boolean(it.separator), (el) => el.border_t(1).border_color(t.border))
        .when(Boolean(it.sub), (el) => el.pl(18))
        .when(hot, (el) => el.bg(t.selected))
        .when(Boolean(it.current), (el) => el.font_semibold())
        .when(Boolean(it.disabled) && !it.current, (el) => el.text_color(t.muted))
        .when(!it.disabled, (el) =>
          el
            .cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => it.run(cx)),
        )
        .child(
          h_flex()
            .gap(4)
            .items_center()
            .child(it.label)
            .when(it.note === "API", (el) => el.child(chip())),
        )
        .when(Boolean(it.current) && p.kind !== "menu", (el) =>
          el.child(div().font_weight(400).text_color(t.muted).child("current")),
        )
        .when(Boolean(it.sublabel), (el) => el.child(div().text_color(t.muted).child(it.sublabel)));
    };
    return v_flex()
      .id("picker")
      .w(220)
      .p(4)
      .bg(t.popover)
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const n = choosable.length;
        if (e.key === "escape") this.close();
        else if (e.key === "down" && n) this.at = (this.at + 1) % n;
        else if (e.key === "up" && n) this.at = (this.at + n - 1) % n;
        else if (e.key === "enter" && n && p.kind !== "labels") choosable[this.at].run(cx);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .when(p.kind === "labels", (el) =>
        el.child(
          div()
            .id("label-field")
            .h(28)
            .px(8)
            .mb(4)
            .flex()
            .items_center()
            .rounded(6)
            .border(1)
            .border_color(t.accent)
            .bg(t.surface)
            .child(Input.new(this.input).w_full()),
        ),
      )
      .children(items.map(row))
      .when(p.kind === "state", (el) =>
        el.child(
          h_flex()
            .flex_wrap()
            .gap(4)
            .items_center()
            .mt(2)
            .px(8)
            .pt(6)
            .pb(4)
            .border_t(1)
            .border_color(t.border)
            .text_size(10)
            .text_color(t.muted)
            .child("All states shown; the server refuses what the workflow forbids.")
            .child(chip()),
        ),
      )
      .when(p.kind === "conductor" && !this.conductorsServed, (el) =>
        el.child(
          h_flex()
            .gap(4)
            .items_center()
            .px(8)
            .py(6)
            .text_color(t.muted)
            .child(chip())
            .child("The conductor list needs the bakers API."),
        ),
      );
  }
}
