// form/keys: the same keys for every form. Inline forms (the title and description editor) send on
// cmd-Enter and cancel on Esc. A dialog never writes from a key: Enter takes the default,
// which keeps things as they are, and Esc does the same; only the primary button writes.
// A dialog that edits text (keys: "inline", ui/form/dialog) takes the inline keys instead.

/** @param {string} keystroke @param {"inline" | "dialog"} kind @returns {"submit" | "cancel" | null} */
export function formKey(keystroke, kind) {
  if (kind === "dialog") return keystroke === "enter" || keystroke === "escape" ? "cancel" : null;
  if (keystroke === "cmd-enter") return "submit";
  if (keystroke === "escape") return "cancel";
  return null;
}
