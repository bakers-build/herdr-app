// ui/theme: the theme mapping, fonts and icons.
// The wireframe is grayscale with one accent; it maps onto Herdr's theme tokens:
//   #f4f4f5 page -> canvas            #ffffff cards, inputs -> surface (inputs: input)
//   #b9b9bf / #ececee / #d9d9dc -> border
//   #1f1f23 text -> foreground        #5c5c63 secondary text -> muted
//   #1d5fcc primary, focus, selection outline -> accent / solid (+ solid_foreground)
//   #eef3fc selected row -> selected  needs-you text, dot, rail count -> blocked
// Sizes, paddings and type sizes are the artboards' px (R2-4 ListTab, R2-3 TicketTab).
import { theme } from "herdr";

export const UI_FONT = "Inter";
export const MONO_FONT = "JetBrains Mono";

export const icons = {
  down: "mods/bakers/ui/icons/chevron-down.svg",
  right: "mods/bakers/ui/icons/chevron-right.svg",
  arrow: "mods/bakers/ui/icons/arrow-right.svg",
};

/** Herdr's theme colors. herdr.d.ts types them as plain strings, gpui-kit's style methods
 *  take its `#rrggbb` Color; Herdr's theme always holds hex colors, so the cast bridges the two.
 *  @returns {Record<string, import("gpui-kit").Color>} */
export function tokens() {
  return /** @type {Record<string, import("gpui-kit").Color>} */ (theme());
}
