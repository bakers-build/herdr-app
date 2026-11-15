// form/state: one form's values, field errors, message and busy flag. The drawing
// (components/form) keeps the text inputs and writes their values here.

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
  }

  /** @param {string} name @param {any} value */
  set(name, value) {
    this.values[name] = value;
    this.dirty = true;
    delete this.errors[name];
  }
}
