// core/dialog: the confirm dialog frame (frame 4, R3-2) the slices fill. A slice defines
// a dialog with defineDialog(kind, { copy, write }); openDialog(kind, props) shows it.
// From and to in pills, one paragraph with the consequence, an optional comment or reason,
// then the buttons: the primary names the action and its target, the other names what
// stays. The non-writing button is the default (Enter) and Esc; nothing is written before
// the primary button. After the write: a toast, a refresh, and the dialog closes.
import { div, svg } from "gpui-kit";
import { h_flex, Input, InputState, Textarea, TextareaState, v_flex } from "gpui-base";
import { closeOverlay, notify, openOverlay, props, theme } from "herdr";
import { register } from "./actions.js";
import { button, icons, UI_FONT } from "./kit.js";
import { getStore, ready, refresh } from "./session.js";

/**
 * @typedef {{ title: string, size?: number, pills?: [string, string], text: string,
 *   field?: "comment" | "reason", label?: string, hint?: string, keep: string, act: string,
 *   primaryFirst?: boolean, keepSolid?: boolean }} DialogCopy
 * @typedef {{ copy: (p: any, ctx: { branch: string | null, from: string | null }) => DialogCopy,
 *   write: (p: any, inputs: { comment: string, reason: string }) => Promise<string | null> }} DialogDef
 */

/** @type {Map<string, DialogDef>} */
const DIALOGS = new Map();

/** @param {string} kind @param {DialogDef} def */
export function defineDialog(kind, def) {
  DIALOGS.set(kind, def);
}

/** @param {string} kind @param {Record<string, unknown>} p */
export function openDialog(kind, p) {
  return openOverlay({
    mod: "bakers",
    props: { view: "dialog", kind, ...p },
    kind: "dialog",
    width: 460,
    modal: true,
  });
}

register("dialog", (kind, p) => openDialog(kind, p));

export default class Dialog {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.comment = TextareaState.new({ placeholder: "", rows: 2 });
    this.reason = InputState.new({ placeholder: "" });
    this.error = null;
    this.busy = false;
    this.ctx = { branch: null, from: props()?.from ?? null };
    cx.spawn(async (cx) => {
      try {
        if (props()?.ticket) {
          await ready();
          const d = await getStore().ticket(props().ticket);
          this.ctx = {
            branch: d?.ticket?.branch_name ?? null,
            from: props().from ?? d?.ticket?.state ?? null,
          };
        }
      } catch {
        // the dialog works without the branch
      }
      cx.notify();
    });
  }

  def() {
    return DIALOGS.get(props()?.kind);
  }

  close() {
    closeOverlay(props().overlay);
  }

  /** @param {any} cx */
  confirm(cx) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    cx.spawn(async (cx) => {
      try {
        const done = await this.def().write(props(), {
          comment: this.comment.value().trim(),
          reason: this.reason.value().trim(),
        });
        this.close();
        if (done) notify({ title: done, level: "success" });
        await refresh();
      } catch (/** @type {any} */ e) {
        this.error = e?.message ?? String(e);
      } finally {
        this.busy = false;
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const def = this.def();
    if (!def) return div().p(20).child(`bakers: no dialog "${props()?.kind}"`);
    const c = def.copy(props(), this.ctx);
    const pill = (/** @type {string} */ text, /** @type {boolean} */ to) =>
      h_flex()
        .h(24)
        .px(10)
        .items_center()
        .rounded(12)
        .border(1)
        .border_color(to ? t.foreground : t.border)
        .when(to, (el) => el.font_semibold())
        .child(text);
    const keep = button(
      "secondary",
      c.keep,
      () => this.close(),
      c.keepSolid ? { primary: true } : {},
    );
    const act = button(
      "primary",
      c.act,
      (_e, cx) => this.confirm(cx),
      c.keepSolid ? {} : { primary: true, disabled: this.busy },
    );
    const field = (/** @type {any} */ content) =>
      div()
        .p(8)
        .rounded(6)
        .border(1)
        .border_color(t.border)
        .bg(t.surface)
        .text_size(12)
        .child(content);
    return v_flex()
      .id("confirm")
      .w_full()
      .p(c.size === 15 ? 16 : 20)
      .gap(12)
      .bg(t.popover)
      .font_family(UI_FONT)
      .text_size(13)
      .text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" || e.key === "enter") this.close();
        else return;
        cx.stop_propagation();
      })
      .child(
        div()
          .text_size(c.size ?? 16)
          .font_semibold()
          .child(c.title),
      )
      .when(Boolean(c.pills), (el) =>
        el.child(
          h_flex()
            .id("pills")
            .gap(8)
            .items_center()
            .text_size(12)
            .child(pill(c.pills[0], false))
            .child(svg(icons.arrow).size(16))
            .child(pill(c.pills[1], true)),
        ),
      )
      .child(div().text_size(12).text_color(t.muted).child(c.text))
      .when(c.field === "comment", (el) =>
        el.child(
          v_flex()
            .gap(4)
            .child(
              div()
                .text_size(11)
                .text_color(t.muted)
                .child("Comment, optional, posted with the change"),
            )
            .child(field(Textarea.new(this.comment).w_full())),
        ),
      )
      .when(c.field === "reason", (el) =>
        el.child(
          v_flex()
            .gap(4)
            .child(div().text_size(11).text_color(t.muted).child(c.label))
            .child(field(Input.new(this.reason).w_full()).h(28).px(8).py(0).flex().items_center()),
        ),
      )
      .when(Boolean(this.error), (el) =>
        el.child(div().text_size(12).text_color(t.blocked).child(this.error)),
      )
      .child(
        h_flex()
          .id("dialog-footer")
          .gap(8)
          .pt(4)
          .items_center()
          .justify_end()
          .when(Boolean(c.hint), (el) =>
            el.child(div().flex_1().text_size(11).text_color(t.muted).child(c.hint)),
          )
          .children(c.primaryFirst ? [act, keep] : [keep, act]),
      );
  }
}
