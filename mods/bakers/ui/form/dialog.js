// ui/form/dialog: the dialog frame (frames 4, R3-2) for any form definition
// registered under props().form (core/registry.js): the title, from and to in pills, the consequence, the
// fields, the message, then the buttons. The primary names the action and its target,
// the other names what stays and is the default. Keys follow form/keys: a key never writes
// in a dialog, unless the definition sets keys: "inline" (an editor in a popup), where
// cmd-Enter sends like the primary button, Esc closes and Enter types a newline. Sending
// follows form/submit (steps, partial failures, conflict).
// On success: close, a toast with the definition's text, then its after().
// The opener (the cmd-K palette, a menu) closes itself and opens the dialog in one call, and the
// dialog's build can settle while that call still runs. A task or timer made then without an owner
// belongs to the running view, the opener, and Herdr ends it with the opener: the form never came.
// So every task and timer the dialog makes names the dialog's root view as its owner, and retained
// state (the text inputs) is created in a timer call of the dialog's own.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { closeOverlay, notify, props } from "herdr";
import { get } from "../../core/registry.js";
import { openRoute } from "../../core/router.js";
import { claimLater } from "../keyboard.js";
import { icons, tokens, UI_FONT } from "../theme.js";
import { formKey } from "../../form/keys.js";
import { FormState } from "../../form/state.js";
import { submit } from "../../form/submit.js";
import { button } from "../components/button.js";
import { pill } from "../components/pill.js";
import { field, FormInputs, message } from "./inputs.js";

/**
 * @param {string} form a registered form kind @param {Record<string, unknown>} p
 * @param {Record<string, unknown>} [extra] overlay fields for this call, such as the width
 */
export function openForm(form, p = {}, extra = {}) {
  return openRoute("dialog", { form, ...p }, extra);
}

/** How long a dialog waits for its form's build. Then a form that registers `now(p)` draws itself
 *  from what it has; any other shows an error the person can read. */
export const FORM_TIMEOUT_MS = 3000;
const LATE = Symbol("late");

export default class Dialog {
  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx
   *  @param {import("gpui-kit").View} [view] this copy's root view, the owner of the dialog's work */
  init(_props, cx, view) {
    /** TaskOptions for every task and timer of the dialog. @type {{ owner: any } | undefined} */
    this.own = view ? { owner: view } : undefined;
    const own = this.own;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.def = null;
    this.error = null;
    /** @type {"loading" | "ready" | null} the frame whose first layout took the keyboard */
    this.frame = null;
    /** True once the dialog closed; the late claim then takes nothing. */
    this.closed = false;
    /** True after a press inside: the person placed the keyboard, and the late claim leaves it. */
    this.pressed = false;
    claimLater(cx, () => this.takeKeyboard(), own);
    // Read now, in the dialog's own call: the body may run in the opener's.
    const p = props();
    cx.spawn(async (cx) => {
      const entry = get("form", p?.form);
      let def;
      try {
        if (!entry?.build) throw new Error(`bakers: no form "${p?.form}"`);
        // A build can wait on another copy's call that Herdr ended; it never holds the dialog.
        def = await Promise.race([
          entry.build(p),
          new Promise((ok) => cx.timer.after(FORM_TIMEOUT_MS, () => ok(LATE), own)),
        ]);
        if (def === LATE) throw new Error(`no answer within ${FORM_TIMEOUT_MS / 1000} s`);
      } catch (/** @type {any} */ e) {
        try {
          def = entry?.now?.(p);
        } catch {
          def = null;
        }
        if (!def) {
          const reason = e?.message ?? String(e);
          this.error = entry ? `This dialog could not load: ${reason}. Esc closes it.` : reason;
          cx.notify();
          return;
        }
      }
      // The text states belong to the copy whose call creates them, and die with it. This
      // continuation can still run inside the opener's call (the palette or a menu, which close
      // themselves), so they are created in a timer call of the dialog's own.
      cx.timer.after(0, (/** @type {any} */ cx) => this.ready(def, cx), own);
    }, own);
  }

  /** Sets the form, its state and its inputs together, in a call the dialog owns.
   *  @param {any} def @param {any} cx */
  ready(def, cx) {
    if (this.closed) return;
    try {
      const state = new FormState(def);
      const inputs = new FormInputs(def, state);
      this.def = def;
      this.state = state;
      this.inputs = inputs;
      inputs.focus();
    } catch (/** @type {any} */ e) {
      this.error = e?.message ?? String(e);
    }
    cx.notify();
  }

  close() {
    this.closed = true;
    closeOverlay(props().overlay);
  }

  /** The first text field, or the dialog itself when it has none. Esc reaches the dialog only on
   *  the focus path, and init's focus comes before the first frame, where it can land on nothing;
   *  after a Herdr start or after R the first layout's can too, so a late claim (ui/keyboard.js)
   *  follows. Nothing once the dialog closed or a press inside placed the keyboard. */
  takeKeyboard() {
    if (this.closed || this.pressed) return;
    if (this.inputs && Object.keys(this.inputs.inputs).length) this.inputs.focus();
    else this.handle?.focus();
  }

  /** Takes the keyboard on the first layout of each frame (loading, then ready); a resize leaves
   *  it. @param {"loading" | "ready"} frame */
  laidOut(frame) {
    if (this.frame === frame) return;
    this.frame = frame;
    this.takeKeyboard();
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
    }, this.own);
  }

  render() {
    const t = tokens();
    const root = v_flex()
      .id("confirm")
      .w_full()
      .bg(t.popover)
      .font_family(UI_FONT)
      .text_size(13)
      .text_color(t.foreground)
      // Propagates, so a field or button under the press still gets it.
      .on_mouse_down("left", () => {
        this.pressed = true;
      });
    // init sets the handle; ready sets def, state and inputs together.
    const handle = this.handle;
    if (!this.def || !this.state || !this.inputs || !handle)
      // Loading or failed: Esc still closes, so a failed form never traps the user.
      return root
        .p(20)
        .when(Boolean(handle), (el) => el.track_focus(/** @type {any} */ (handle)))
        .on_size_change(() => this.laidOut("loading"))
        .on_key_down((e, cx) => {
          if (formKey(e.keystroke, "inline") !== "cancel") return;
          this.close();
          cx.stop_propagation();
        })
        .child(
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
      .track_focus(handle)
      .on_size_change(() => this.laidOut("ready"))
      .on_key_down((e, cx) => {
        const k = formKey(e.keystroke, d.keys === "inline" ? "inline" : "dialog");
        if (k === "submit") this.send(cx);
        else if (k === "cancel") this.close();
        else return;
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
