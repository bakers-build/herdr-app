// ui/form/dialog: the dialog frame (frames 4, R3-2) for any form definition
// registered under props().form (core/registry.js): the title, from and to in pills, the consequence, the
// fields, the message, then the buttons. The primary names the action and its target,
// the other names what stays and is the default. Keys follow form/keys (a key never
// writes in a dialog); sending follows form/submit (steps, partial failures, conflict).
// On success: close, a toast with the definition's text, then its after().
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, notify, props } from "herdr";
import { get } from "../../core/registry.js";
import { openRoute } from "../../core/router.js";
import { icons, tokens, UI_FONT } from "../theme.js";
import { formKey } from "../../form/keys.js";
import { FormState } from "../../form/state.js";
import { submit } from "../../form/submit.js";
import { button } from "../components/button.js";
import { pill } from "../components/pill.js";
import { field, FormInputs, message } from "./inputs.js";

/** @param {string} form a registered form kind @param {Record<string, unknown>} p */
export function openForm(form, p = {}) {
  return openRoute("dialog", { form, ...p });
}

export default class Dialog {
  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.def = null;
    this.error = null;
    cx.spawn(async (cx) => {
      try {
        const build = get("form", props()?.form)?.build;
        if (!build) throw new Error(`bakers: no form "${props()?.form}"`);
        this.def = await build(props());
        this.state = new FormState(this.def);
        this.inputs = new FormInputs(this.def, this.state);
        this.inputs.focus();
      } catch (/** @type {any} */ e) {
        this.error = e?.message ?? String(e);
      }
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  /** @param {any} cx */
  send(cx) {
    const state = this.state;
    if (!state) return;
    cx.spawn(async (/** @type {any} */ cx) => {
      const r = await submit(this.def, state);
      if (r.ok) {
        this.close();
        if (r.success) notify({ title: r.success, level: "success" });
        await this.def.after?.(r.results ?? []);
      }
      cx.notify();
    });
  }

  render() {
    const t = tokens();
    const root = v_flex()
      .id("confirm")
      .w_full()
      .bg(t.popover)
      .font_family(UI_FONT)
      .text_size(13)
      .text_color(t.foreground);
    // init sets the handle; def, state and inputs are set together, without an await between.
    if (!this.def || !this.state || !this.inputs || !this.handle)
      return root.p(20).child(
        div()
          .text_color(this.error ? t.blocked : t.muted)
          .child(this.error ?? "..."),
      );
    const d = this.def;
    const keep = button(
      "secondary",
      d.keep,
      () => this.close(),
      d.keepSolid ? { primary: true } : {},
    );
    const act = button(
      "primary",
      d.submit,
      (_e, cx) => this.send(cx),
      d.keepSolid ? {} : { primary: true, disabled: this.state.busy },
    );
    const msg = message(this.state);
    const inputs = this.inputs;
    return root
      .p(d.size === 15 ? 16 : 20)
      .gap(12)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (formKey(e.keystroke, "dialog") !== "cancel") return;
        this.close();
        cx.stop_propagation();
      })
      .child(
        div()
          .text_size(d.size ?? 16)
          .font_semibold()
          .child(d.title),
      )
      .when(Boolean(d.pills), (el) =>
        el.child(
          h_flex()
            .id("pills")
            .gap(8)
            .items_center()
            .text_size(12)
            .child(pill(d.pills[0], { px: 10 }))
            .child(svg(icons.arrow).size(16))
            .child(pill(d.pills[1], { px: 10, strong: true })),
        ),
      )
      .when(Boolean(d.text), (el) =>
        el.child(div().text_size(12).text_color(t.muted).child(d.text)),
      )
      .children((d.fields ?? []).map((/** @type {any} */ f) => field(f, inputs)))
      .when(Boolean(msg), (el) => el.child(msg ?? ""))
      .child(
        h_flex()
          .id("dialog-footer")
          .gap(8)
          .pt(4)
          .items_center()
          .justify_end()
          .when(Boolean(d.hint), (el) =>
            el.child(div().flex_1().text_size(11).text_color(t.muted).child(d.hint)),
          )
          .children(d.submitFirst ? [act, keep] : [keep, act]),
      );
  }
}
