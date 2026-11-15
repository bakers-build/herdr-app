// features/document: Markdown through Herdr's own TextView (gpui-base, herdr-app v0.1.15).
import { TextView } from "gpui-base";

/** @param {string} id @param {string} src */
export function renderMarkdown(id, src) {
  return TextView.markdown(id, src ?? "");
}
