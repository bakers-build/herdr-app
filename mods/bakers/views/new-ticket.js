// New ticket (N, cmd-shift-N, the header button): a minimal dialog with title, type and
// description. Frame 5 is not a pixel target. bakers_ticket_create takes the project and
// the workflow of an existing ticket of the project; the new ticket opens as a pinned tab.
import { div } from "gpui-kit";
import { h_flex, Input, InputState, Textarea, TextareaState, v_flex } from "gpui-base";
import { closeOverlay, props, theme } from "herdr";
import { refresh } from "../lib/actions.js";
import { api, getStore, ready } from "../lib/context.js";
import { openTicket } from "../lib/tabs.js";
import { button, UI_FONT } from "../lib/theme.js";

const TYPES = ["feature", "bug", "chore"];

export default class NewTicket {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.title = InputState.new({ placeholder: "Title" });
    this.description = TextareaState.new({ placeholder: "Description (Markdown)", rows: 6 });
    this.type = "feature";
    this.error = null;
    this.busy = false;
    this.title.on("change", (_e, cx) => cx.notify());
    this.title.focus();
  }

  close() {
    closeOverlay(props().overlay);
  }

  /** The workflow of an existing ticket of the project. */
  async workflow() {
    const store = getStore();
    for (const t of store.tickets) {
      const cached = store.cached(t.id)?.ticket?.workflow;
      if (cached) return cached;
    }
    const first = store.tickets[0];
    if (first) return (await api.readTicket(first.id))?.workflow ?? "bb_work";
    return "bb_work";
  }

  /** @param {any} cx */
  create(cx) {
    const title = this.title.value().trim();
    if (!title || this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const p = await ready();
        const created = await api.createTicket({
          title,
          project: p.uuid,
          workflow: await this.workflow(),
          type: this.type,
          description: this.description.value().trim() || null,
        });
        this.close();
        openTicket(
          { id: created.identifier, state: created.state ?? "qualification" },
          { pin: true },
        );
        await refresh();
      } catch (/** @type {any} */ e) {
        this.error = `Not created: ${e?.message ?? e}`;
      } finally {
        this.busy = false;
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const field = () =>
      div().p(8).rounded(6).border(1).border_color(t.border).bg(t.surface).text_size(12);
    return v_flex()
      .id("new-ticket")
      .w_full()
      .p(20)
      .gap(12)
      .bg(t.popover)
      .font_family(UI_FONT)
      .text_size(13)
      .text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") this.close();
        else if (e.keystroke === "cmd-enter") this.create(cx);
        else return;
        cx.stop_propagation();
      })
      .child(div().text_size(16).font_semibold().child("New ticket"))
      .child(field().child(Input.new(this.title).w_full()))
      .child(
        h_flex()
          .gap(6)
          .children(
            TYPES.map((ty) =>
              h_flex()
                .id(`type-${ty}`)
                .h(24)
                .px(10)
                .items_center()
                .rounded(12)
                .border(1)
                .border_color(this.type === ty ? t.foreground : t.border)
                .when(this.type === ty, (el) => el.font_semibold())
                .text_size(12)
                .cursor_pointer()
                .on_click((_e, cx) => {
                  this.type = ty;
                  cx.notify();
                })
                .child(ty),
            ),
          ),
      )
      .child(field().child(Textarea.new(this.description).w_full()))
      .when(Boolean(this.error), (el) =>
        el.child(div().text_size(12).text_color(t.blocked).child(this.error)),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .justify_end()
          .child(
            div()
              .flex_1()
              .text_size(11)
              .text_color(t.muted)
              .child("cmd-Enter creates, Esc cancels"),
          )
          .child(button("secondary", "Cancel", () => this.close()))
          .child(button("primary", "Create", (_e, cx) => this.create(cx), { primary: true })),
      );
  }
}
