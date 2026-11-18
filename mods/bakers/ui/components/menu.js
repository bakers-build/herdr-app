// ui/components/menu: the popup menu everything opens (the "..." menus, the view menu, the state
// menu, Type and Recipe). Items carry actions (core/actions.js). Up, Down, Enter and Esc
// as in Herdr's menu mod (v0.1.15 defaults/mods/menu).
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, openOverlay, props } from "herdr";
import { perform } from "../../core/actions.js";
import { tokens, UI_FONT } from "../theme.js";
import { chip } from "./chip.js";

/**
 * @typedef {{ label: string, action?: any[], hint?: string, current?: boolean, disabled?: boolean,
 *   separator?: boolean, sub?: boolean, api?: boolean }} MenuItem
 */

/**
 * @param {MenuItem[]} items
 * @param {{ footer?: string, footerApi?: boolean, at?: { x: number, y: number } }} [o]
 */
export function openMenu(items, o = {}) {
  return openOverlay({
    mod: "bakers",
    props: { view: "menu", items, footer: o.footer, footerApi: o.footerApi },
    kind: "popup",
    width: 220,
    ...(o.at ? { at: o.at } : {}),
  });
}

/** Draws one menu row; shared with the pickers of the slices. @param {any} t @param {any} it @param {boolean} hot @param {(cx: any) => void} choose */
export function menuRow(t, it, hot, choose) {
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
        .on_click((_e, cx) => choose(cx)),
    )
    .child(
      h_flex()
        .gap(4)
        .items_center()
        .child(it.label)
        .when(Boolean(it.api), (el) => el.child(chip())),
    )
    .when(Boolean(it.hint), (el) =>
      el.child(div().font_weight(400).text_color(t.muted).child(it.hint)),
    );
}

/** A popup frame with keyboard choice over `rows`; the slices' pickers use it too. */
export class PopupList {
  /** @type {any} */ handle = null;
  /** The keyboard-selected row among the choosable ones. */
  at = 0;
  /** True while a text field of the popup has the keyboard: Enter belongs to it. */
  typing = false;

  /** @param {unknown} _props @param {any} cx */
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = 0;
    this.typing = false;
  }

  close() {
    closeOverlay(props().overlay);
  }

  /** @returns {any[]} rows with key, label and choose(cx) */
  items() {
    return [];
  }

  /** @param {any} _t @returns {any} drawn above the rows */
  top(_t) {
    return null;
  }

  /** @param {any} _t @returns {any} drawn below the rows */
  bottom(_t) {
    return null;
  }

  render() {
    const t = tokens();
    const items = this.items();
    const choosable = items.filter((i) => !i.disabled);
    const top = this.top(t);
    const bottom = this.bottom(t);
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
        else if (e.key === "enter" && n && !this.typing) choosable[this.at].choose(cx);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .when(Boolean(top), (el) => el.child(top))
      .children(items.map((it) => menuRow(t, it, choosable[this.at] === it, (cx) => it.choose(cx))))
      .when(Boolean(bottom), (el) => el.child(bottom));
  }
}

/** The view "menu": props.items with actions, an optional footer note with the API chip. */
export default class Menu extends PopupList {
  items() {
    const p = props() ?? {};
    return (p.items ?? []).map((/** @type {any} */ it, /** @type {number} */ i) => ({
      ...it,
      key: it.key ?? String(i),
      choose: (/** @type {any} */ cx) => {
        this.close();
        // The menu is gone once an item is chosen; the action reports its own outcome.
        void perform(it.action, cx);
      },
    }));
  }

  /** @param {Record<string, import("gpui-kit").Color>} t */
  bottom(t) {
    const p = props() ?? {};
    if (!p.footer) return null;
    return h_flex()
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
      .child(p.footer)
      .when(Boolean(p.footerApi), (el) => el.child(chip()));
  }
}
