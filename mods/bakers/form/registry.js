// form/registry: dialogs open as their own mod copy, so a dialog finds its definition by
// kind. Each entity registers its forms when main.js imports it.

/** @type {Map<string, (props: any) => any | Promise<any>>} */
const FORMS = new Map();

/** @param {string} kind @param {(props: any) => any | Promise<any>} build */
export function defineForm(kind, build) {
  FORMS.set(kind, build);
}

/** @param {string} kind */
export function formBuilder(kind) {
  return FORMS.get(kind) ?? null;
}
