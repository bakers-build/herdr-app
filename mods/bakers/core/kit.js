// core/kit: the drawing bits every slice shares, and the theme mapping.
// The wireframe is grayscale with one accent; it maps onto Herdr's theme tokens:
//   #f4f4f5 page -> canvas            #ffffff cards, inputs -> surface (inputs: input)
//   #b9b9bf / #ececee / #d9d9dc -> border
//   #1f1f23 text -> foreground        #5c5c63 secondary text -> muted
//   #1d5fcc primary, focus, selection outline -> accent / solid (+ solid_foreground)
//   #eef3fc selected row -> selected  needs-you text, dot, rail count -> blocked
// Sizes, paddings and type sizes are the artboards' px (R2-4 ListTab, R2-3 TicketTab).
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";

export const UI_FONT = "Inter";
export const MONO_FONT = "JetBrains Mono";

export const icons = {
  down: "mods/bakers/icons/chevron-down.svg",
  right: "mods/bakers/icons/chevron-right.svg",
  arrow: "mods/bakers/icons/arrow-right.svg",
};

export function tokens() {
  return theme();
}

/** Upper-case section heading: 11 px, 600, muted (the artboards' text-transform). @param {string} text */
export function heading(text) {
  const t = theme();
  return div().text_size(11).font_semibold().text_color(t.muted).child(text.toUpperCase());
}

/** The dashed "API" chip for what the bakers API cannot deliver yet. @param {number} [size] */
export function chip(size = 8) {
  const t = theme();
  return h_flex()
    .flex_none()
    .h(size === 8 ? 14 : 16)
    .px(size === 8 ? 4 : 5)
    .items_center()
    .rounded(size === 8 ? 3 : 4)
    .border(1)
    .border_dashed()
    .border_color(t.muted)
    .text_size(size)
    .font_semibold()
    .text_color(t.muted)
    .child("API");
}

/** An identifier in the monospace font. @param {string} text @param {number} [size] */
export function mono(text, size = 12) {
  return div().font_family(MONO_FONT).text_size(size).child(text);
}

/** A round status dot; `ring` draws the hollow one. @param {string} tone @param {boolean} [ring] */
export function dot(tone, ring = false) {
  const t = theme();
  const color = t[tone] ?? t.muted;
  return ring
    ? div().size(8).flex_none().rounded(4).border(1).border_color(color)
    : div().size(8).flex_none().rounded(4).bg(color);
}

/**
 * A button as drawn: 1 px border, 6 px corners; primary is solid, semibold, no border.
 * @param {string} id
 * @param {string} label
 * @param {((e: any, cx: any) => void) | null} onClick
 * @param {{ primary?: boolean, h?: number, px?: number, size?: number, disabled?: boolean, reason?: string }} [o]
 */
export function button(id, label, onClick, o = {}) {
  const t = theme();
  const h = o.h ?? 28;
  const el = h_flex()
    .id(id)
    .flex_none()
    .h(h)
    .px(o.px ?? (o.primary ? 12 : h <= 24 ? 8 : 10))
    .items_center()
    .rounded(6)
    .when(o.size != null, (e) => e.text_size(o.size))
    .when(Boolean(o.primary), (e) => e.bg(t.solid).text_color(t.solid_foreground).font_semibold())
    .when(!o.primary, (e) =>
      e.border(1).border_color(t.border).bg(t.surface).text_color(t.foreground),
    )
    .child(label);
  if (o.disabled)
    return el
      .disabled(true)
      .opacity(0.5)
      .when(Boolean(o.reason), (e) => e.tooltip(o.reason));
  return onClick
    ? el
        .cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click(onClick)
    : el;
}

/** The chevron icon. @param {number} [size] */
export function chevron(size = 12) {
  return svg(icons.down).size(size).flex_none();
}

/** A node of Herdr's live layout tree (layout()) by id. @param {any} node @param {string} id @returns {any} */
export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}
