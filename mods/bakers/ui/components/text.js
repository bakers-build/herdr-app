// ui/components/text: an identifier in the monospace font; an upper-case section heading.
import { div } from "gpui-kit";
import { theme } from "herdr";
import { MONO_FONT } from "../theme.js";

/** @param {string} text @param {number} [size] */
export function mono(text, size = 12) {
  return div().font_family(MONO_FONT).text_size(size).child(text);
}

/** 11 px, 600, muted, upper case (the artboards' text-transform). @param {string} text */
export function heading(text) {
  const t = theme();
  return div().text_size(11).font_semibold().text_color(t.muted).child(text.toUpperCase());
}
