// The composer at the bottom of a ticket tab (frame R2-3): comment mode, or answer mode
// while the agent asked a question. Kept on the ticket view as plain state; the ticket
// view draws it with render().
import { div } from "gpui-kit";
import { h_flex, Textarea, TextareaState, v_flex } from "gpui-base";
import { theme } from "herdr";
import { button } from "../lib/theme.js";

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
