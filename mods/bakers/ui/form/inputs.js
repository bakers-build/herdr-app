// ui/form/inputs: the retained text inputs of one form (created once, never in
// render) and the drawing of each field. Every change goes into the form's state.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, Textarea, TextareaState, v_flex } from "gpui-base";
import { theme } from "herdr";
import { heading } from "../components/text.js";

/**
 * A field: { name, type: "input" | "textarea" | "checkbox" | "choice", label?, heading?,
 * value?, placeholder?, rows?, size?, strong?, options? }.
 */
export class FormInputs {
  /** @param {any} def @param {import("../../form/state.js").FormState} state @param {() => void} [onType] */
  constructor(def, state, onType) {
    this.state = state;
    /** @type {Record<string, any>} */
    this.inputs = {};
    for (const f of def.fields ?? []) {
      if (f.type !== "input" && f.type !== "textarea") continue;
      const value = String(state.values[f.name] ?? "");
      const input =
        f.type === "input"
          ? InputState.new({ value, placeholder: f.placeholder ?? "" })
          : TextareaState.new({ value, placeholder: f.placeholder ?? "", rows: f.rows ?? 3 });
      input.on("change", (_e, cx) => {
        state.set(f.name, input.value());
        onType?.();
        cx?.notify?.();
      });
      this.inputs[f.name] = input;
    }
  }

  /** @param {string} name */
  input(name) {
    return this.inputs[name];
  }

  /** @param {string} name @param {string} value */
  setText(name, value) {
    this.inputs[name]?.set_value(value);
    this.state.values[name] = value;
  }

  focus(name = Object.keys(this.inputs)[0]) {
    this.inputs[name]?.focus();
  }
}

/** @param {any} f @param {FormInputs} inputs */
export function field(f, inputs) {
  const t = theme();
  const state = inputs.state;
  const error = state.errors[f.name];
  if (f.type === "checkbox") {
    const on = Boolean(state.values[f.name]);
    return h_flex()
      .id(f.name)
      .gap(6)
      .items_center()
      .text_size(11)
      .text_color(t.muted)
      .cursor_pointer()
      .on_click((_e, cx) => {
        state.set(f.name, !on);
        cx.notify();
      })
      .child(
        div()
          .size(12)
          .rounded(3)
          .border(1)
          .border_color(on ? t.accent : t.border)
          .when(on, (d) => d.bg(t.accent)),
      )
      .child(f.label);
  }
  if (f.type === "choice")
    return h_flex()
      .gap(6)
      .children(
        f.options.map((/** @type {string} */ o) =>
          h_flex()
            .id(`${f.name}-${o}`)
            .h(24)
            .px(10)
            .items_center()
            .rounded(12)
            .border(1)
            .border_color(state.values[f.name] === o ? t.foreground : t.border)
            .when(state.values[f.name] === o, (el) => el.font_semibold())
            .text_size(12)
            .cursor_pointer()
            .on_click((_e, cx) => {
              state.set(f.name, o);
              cx.notify();
            })
            .child(o),
        ),
      );
  const input = inputs.input(f.name);
  const box = div()
    .id(`field-${f.name}`)
    .p(8)
    .rounded(6)
    .border(1)
    .border_color(error ? t.blocked : t.border)
    .bg(t.surface)
    .text_color(t.foreground)
    .text_size(f.size ?? 12)
    .when(Boolean(f.strong), (el) => el.font_semibold())
    .child(f.type === "input" ? Input.new(input).w_full() : Textarea.new(input).w_full());
  return v_flex()
    .gap(4)
    .when(Boolean(f.heading), (el) => el.child(heading(f.heading)))
    .when(Boolean(f.label), (el) =>
      el.child(div().text_size(11).text_color(t.muted).child(f.label)),
    )
    .child(box)
    .when(Boolean(error), (el) => el.child(div().text_size(11).text_color(t.blocked).child(error)));
}

/** The form's message (a failure or the conflict warning). @param {import("../../form/state.js").FormState} state */
export function message(state) {
  const t = theme();
  return state.message
    ? div().id("form-message").text_size(11).text_color(t.blocked).child(state.message.message)
    : null;
}
