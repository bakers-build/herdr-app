// form/state: one form's values, field errors, message, busy flag and the steps a failed
// submit already finished. The drawing
// (ui/form) keeps the text inputs and writes their values here.

export class FormState {
  /** @param {{ fields?: { name: string, type: string, value?: any }[] }} def */
  constructor(def) {
    /** @type {Record<string, any>} */
    this.values = {};
    for (const f of def.fields ?? [])
      this.values[f.name] = f.value ?? (f.type === "checkbox" ? false : "");
    /** @type {Record<string, string>} */
    this.errors = {};
    /** @type {{ kind: string, message: string } | null} */
    this.message = null;
    this.busy = false;
    this.dirty = false;
    this.warned = false;
    /** The steps a failed submit finished, by step index: their result and the values of the
     * fields they post (Step.uses) when they ran. A retry skips them unless one of those
     * values changed since. @type {Map<number, { result: any, seen: any[] }>} */
    this.finished = new Map();
  }

  /** @param {string} name @param {any} value */
  set(name, value) {
    this.values[name] = value;
    this.dirty = true;
    delete this.errors[name];
  }
}
