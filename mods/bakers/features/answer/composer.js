// features/answer: the composer at the bottom of a ticket tab (frame R2-3), in comment
// mode, or in answer mode while the agent asked a question. Send answer is three calls,
// not atomic: the comment, then (checked) unfreeze and remove Question, then a toast; a
// failure after the comment names the failed step and keeps the text.
import { div } from "gpui-kit";
import { h_flex, Textarea, TextareaState, v_flex } from "gpui-base";
import { notify, theme } from "herdr";
import { call } from "../../core/cli.js";
import { button } from "../../core/kit.js";

export class Composer {
  /** @param {{ onChange?: () => void }} [hooks] */
  constructor(hooks = {}) {
    this.mode = "comment";
    this.unfreeze = true;
    this.error = null;
    this.busy = false;
    this.focused = false;
    this.text = TextareaState.new({ placeholder: "Comment", rows: 3 });
    this.text.on("change", () => hooks.onChange?.());
    this.text.on("focus", () => {
      this.focused = true;
    });
    this.text.on("blur", () => {
      this.focused = false;
    });
  }

  answer() {
    this.mode = "answer";
    this.text.focus();
  }

  plain() {
    this.mode = "comment";
  }

  /**
   * cmd-Enter sends, Esc goes back to a plain comment; true when the key was the composer's.
   * @param {string} k @param {string} id @param {any} cx @param {() => Promise<void>} done
   */
  key(k, id, cx, done) {
    if (!this.focused) return false;
    if (k === "cmd-enter") this.post(id, this.mode === "answer" && this.unfreeze, cx, done);
    else if (k === "escape") this.plain();
    else return false;
    return true;
  }

  /** @param {string} id @param {any} cx @param {() => Promise<void>} done */
  send(id, cx, done) {
    this.post(id, this.unfreeze, cx, done);
  }

  /** @param {string} id @param {any} cx @param {() => Promise<void>} done */
  comment(id, cx, done) {
    this.post(id, false, cx, done);
  }

  /** @param {string} id @param {boolean} unfreeze @param {any} cx @param {() => Promise<void>} done */
  post(id, unfreeze, cx, done) {
    const body = this.text.value().trim();
    if (!body || this.busy) return;
    this.busy = true;
    this.error = null;
    const answering = this.mode === "answer";
    cx.spawn(async (cx) => {
      let posted = false;
      try {
        await call("bakers_comment_publish", { ticket: id, type: "comment", body });
        posted = true;
        if (answering && unfreeze)
          await call("bakers_ticket_update", {
            ticket: id,
            frozen: false,
            labels_remove: ["Question"],
          });
        this.text.set_value("");
        this.plain();
        if (answering) notify({ title: `Answered ${id}, the run continues`, level: "success" });
        await done();
      } catch (/** @type {any} */ e) {
        this.error = posted
          ? `Comment posted; unfreezing failed: ${e?.message ?? e}`
          : `Not sent: ${e?.message ?? e}`;
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  /** @param {{ send: (cx: any) => void, comment: (cx: any) => void }} on */
  render(on) {
    const t = theme();
    const answering = this.mode === "answer";
    return h_flex()
      .id("composer")
      .flex_none()
      .justify_center()
      .px(24)
      .py(10)
      .when(answering, (el) => el.border_t_2().border_color(t.accent))
      .when(!answering, (el) => el.border_t(1).border_color(t.border))
      .child(
        v_flex()
          .w_full()
          .max_w(760)
          .gap(6)
          .when(answering, (el) =>
            el.child(
              div()
                .text_size(11)
                .font_semibold()
                .text_color(t.accent)
                .child("Answer to the agent's question"),
            ),
          )
          .child(
            div()
              .id("composer-field")
              .p(8)
              .rounded(6)
              .border(1)
              .border_color(t.border)
              .bg(t.surface)
              .text_size(12)
              .text_color(t.foreground)
              .child(Textarea.new(this.text).w_full()),
          )
          .when(Boolean(this.error), (el) =>
            el.child(
              div().id("composer-error").text_size(11).text_color(t.blocked).child(this.error),
            ),
          )
          .child(
            h_flex()
              .gap(8)
              .items_center()
              .when(answering, (el) =>
                el
                  .child(
                    h_flex()
                      .id("unfreeze")
                      .gap(6)
                      .items_center()
                      .text_size(11)
                      .text_color(t.muted)
                      .cursor_pointer()
                      .on_click((_e, cx) => {
                        this.unfreeze = !this.unfreeze;
                        cx.notify();
                      })
                      .child(
                        div()
                          .size(12)
                          .rounded(3)
                          .border(1)
                          .border_color(this.unfreeze ? t.accent : t.border)
                          .when(this.unfreeze, (d) => d.bg(t.accent)),
                      )
                      .child("Unfreeze and remove the label Question"),
                  )
                  .child(
                    div()
                      .flex_1()
                      .text_size(11)
                      .text_color(t.muted)
                      .text_right()
                      .child("cmd-Enter sends, Esc back to a plain comment"),
                  )
                  .child(
                    button("just-comment", "Just comment", (_e, cx) => on.comment(cx), {
                      h: 26,
                      size: 12,
                    }),
                  )
                  .child(
                    button("send-answer", "Send answer", (_e, cx) => on.send(cx), {
                      h: 26,
                      size: 12,
                      primary: true,
                    }),
                  ),
              )
              .when(!answering, (el) =>
                el
                  .child(
                    div()
                      .flex_1()
                      .text_size(11)
                      .text_color(t.muted)
                      .text_right()
                      .child("cmd-Enter sends"),
                  )
                  .child(
                    button("send-comment", "Comment", (_e, cx) => on.comment(cx), {
                      h: 26,
                      size: 12,
                      primary: true,
                    }),
                  ),
              ),
          ),
      );
  }
}
