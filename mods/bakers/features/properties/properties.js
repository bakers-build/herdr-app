// features/properties: the panel's Properties (R2-3). Type and Recipe save at once
// (bakers_ticket_classify), Labels add and remove at once (bakers_ticket_update), Frozen
// asks first (features/freeze draws the dialog), Assignee and Reviewers carry the API
// chip, then Branch, Parent and Links.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, v_flex } from "gpui-base";
import { exec, openOverlay, props, theme, window } from "herdr";
import { perform, register } from "../../core/actions.js";
import { call } from "../../core/cli.js";
import { openDialog } from "../../core/dialog.js";
import { age, toMs } from "../../core/format.js";
import { button, chip, heading, mono } from "../../core/kit.js";
import { openMenu, PopupList } from "../../core/menu.js";
import { getStore, refresh } from "../../core/session.js";

export const TYPES = ["feature", "bug", "chore", "deployment", "verification"];
export const RECIPES = ["superpowers", "matt", "deploy-and-release", "verify"];

register("properties.classify", async (ticket, fields) => {
  await call("bakers_ticket_classify", { ticket, ...fields });
  await refresh();
});
register("properties.labels", async (ticket, fields) => {
  await call("bakers_ticket_update", { ticket, ...fields });
  await refresh();
});

/** Opens a link with the system's opener (Herdr has no URL command). @param {string} url */
function openUrl(url) {
  const platform = window()?.platform;
  if (platform === "macos") exec("open", [url]);
  else if (platform === "windows") exec("cmd", ["/c", "start", "", url]);
  else exec("xdg-open", [url]);
}

/** @param {any} ticket @param {() => Promise<void>} reload after a label is removed */
export function properties(ticket, reload) {
  const t = theme();
  const id = ticket.identifier;
  const label = (/** @type {string} */ text) => div().text_size(11).text_color(t.muted).child(text);
  const cell = (/** @type {any} */ name, /** @type {any} */ value, span = false) =>
    v_flex()
      .when(span, (el) => el.w_full())
      .when(!span, (el) => el.w(160))
      .child(name)
      .child(value);
  const pick = (/** @type {string} */ field, /** @type {string[]} */ values) => () =>
    openMenu(
      values.map((v) => ({
        label: v,
        current: ticket[field] === v,
        action: ["properties.classify", id, { [field]: v }],
      })),
    );
  const labels = h_flex()
    .gap(4)
    .mt(2)
    .flex_wrap()
    .children(
      (ticket.labels ?? []).map((/** @type {string} */ name) =>
        h_flex()
          .h(20)
          .px(8)
          .gap(4)
          .items_center()
          .rounded(10)
          .border(1)
          .border_color(t.border)
          .bg(t.raised)
          .text_size(11)
          .child(name)
          .child(
            div()
              .id(`label-x-${name}`)
              .text_color(t.muted)
              .cursor_pointer()
              .on_click((_e, cx) =>
                cx.spawn(async (cx) => {
                  await call("bakers_ticket_update", { ticket: id, labels_remove: [name] });
                  await reload();
                  cx.notify();
                }),
              )
              .child("×"),
          ),
      ),
    )
    .child(
      h_flex()
        .id("label-add")
        .h(20)
        .px(8)
        .items_center()
        .rounded(10)
        .border(1)
        .border_dashed()
        .border_color(t.muted)
        .bg(t.surface)
        .text_size(11)
        .text_color(t.muted)
        .cursor_pointer()
        .on_click(() =>
          openOverlay({
            mod: "bakers",
            props: { view: "label-picker", ticket: id },
            kind: "popup",
            width: 220,
          }),
        )
        .child("+"),
    );
  const frozenSince = toMs(ticket.frozen_at);
  const kind = ticket.frozen ? "unfreeze" : "freeze";
  const frozen = h_flex()
    .gap(4)
    .items_center()
    .child(ticket.frozen ? `Yes${frozenSince ? `, ${age(Date.now() - frozenSince)}` : ""}` : "No")
    .child(
      button(
        kind,
        ticket.frozen ? "Unfreeze..." : "Freeze...",
        () => openDialog(kind, { ticket: id }),
        { h: 20, px: 6, size: 11 },
      ).rounded(4),
    );
  const apiLabel = (/** @type {string} */ text) =>
    h_flex().gap(4).items_center().text_size(11).text_color(t.muted).child(text).child(chip());
  const link = (ticket.links ?? [])[0];
  return h_flex()
    .id("properties")
    .flex_wrap()
    .gap(12)
    .child(div().w_full().child(heading("Properties")))
    .child(
      cell(
        label("Type"),
        div()
          .id("prop-type")
          .cursor_pointer()
          .on_click(pick("type", TYPES))
          .child(ticket.type ?? "-"),
      ),
    )
    .child(
      cell(
        label("Recipe"),
        div()
          .id("prop-recipe")
          .cursor_pointer()
          .on_click(pick("recipe", RECIPES))
          .child(ticket.recipe ?? "-"),
      ),
    )
    .child(cell(label("Labels"), labels, true))
    .child(cell(label("Frozen"), frozen))
    .child(cell(apiLabel("Assignee"), div().text_color(t.muted).child("-")))
    .child(cell(apiLabel("Reviewers"), div().text_color(t.muted).child("-")))
    .child(cell(label("Branch"), mono(ticket.branch_name ?? "-", 11), true))
    .child(
      cell(
        label("Parent"),
        ticket.parent ? div().child(String(ticket.parent)) : div().text_color(t.muted).child("-"),
      ),
    )
    .child(
      cell(
        label("Links"),
        link
          ? div()
              .id("link-0")
              .text_color(t.accent)
              .cursor_pointer()
              .on_click(() => openUrl(link.uri))
              .child(link.title ?? link.uri)
          : div().text_color(t.muted).child("-"),
      ),
    );
}

/** The view "label-picker": labels used in the project, or a typed one (label_list needs a workspace id). */
export class LabelPicker extends PopupList {
  init(p, cx) {
    super.init(p, cx);
    this.typing = true;
    this.input = InputState.new({ placeholder: "Label name" });
    this.input.on("change", (_e, cx) => cx.notify());
    this.input.on("submit", (_e, cx) => this.add(this.input.value(), cx));
    this.input.focus();
  }

  /** @param {string} name @param {any} cx */
  add(name, cx) {
    const label = name.trim();
    if (!label) return;
    this.close();
    cx.spawn(async () => {
      await perform(["properties.labels", props().ticket, { labels_add: [label] }], cx);
    });
  }

  items() {
    const q = this.input.value().trim().toLowerCase();
    const known = new Set();
    for (const tk of getStore().tickets) for (const l of tk.labels ?? []) known.add(l);
    return [...known]
      .filter((l) => !q || l.toLowerCase().includes(q))
      .sort()
      .map((l) => ({ key: l, label: l, choose: (/** @type {any} */ cx) => this.add(l, cx) }));
  }

  top(t) {
    return div()
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
      .child(Input.new(this.input).w_full());
  }
}
