// features/edit: title and description become editable (E or a click); cmd-Enter saves
// both with bakers_ticket_update, Esc cancels. The description is replaced whole without
// a revision check (API), so saving warns once when the ticket changed since editing began.
import { div } from "gpui-kit";
import { Input, InputState, Textarea, TextareaState, v_flex } from "gpui-base";
import { theme } from "herdr";
import { call, readTicket } from "../../core/cli.js";
import { heading } from "../../core/kit.js";

/** The fingerprint the warning compares. @param {any} tk */
function stamp(tk) {
  return JSON.stringify([
    tk?.revision ?? tk?.changed ?? null,
    tk?.title ?? "",
    tk?.description ?? "",
  ]);
}

export class Editor {
  /** @param {{ onType?: () => void }} [hooks] */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.state = null;
  }

  get active() {
    return this.state !== null;
  }

  /** @param {any} ticket */
  start(ticket) {
    if (this.state) return;
    const title = InputState.new({ value: ticket.title ?? "" });
    const description = TextareaState.new({ value: ticket.description ?? "", rows: 10 });
    title.on("change", () => this.hooks.onType?.());
    description.on("change", () => this.hooks.onType?.());
    this.state = {
      id: ticket.identifier,
      title,
      description,
      stamp: stamp(ticket),
      warned: false,
      error: null,
    };
    title.focus();
  }

  cancel() {
    this.state = null;
  }

  /** cmd-Enter saves, Esc cancels; true when the key was the editor's. @param {string} k @param {any} cx @param {() => Promise<void>} done */
  key(k, cx, done) {
    if (!this.state) return false;
    if (k === "cmd-enter") this.save(cx, done);
    else if (k === "escape") this.cancel();
    else return false;
    return true;
  }

  /** @param {any} cx @param {() => Promise<void>} done */
  save(cx, done) {
    const ed = this.state;
    if (!ed) return;
    cx.spawn(async (cx) => {
      try {
        if (!ed.warned && stamp(await readTicket(ed.id)) !== ed.stamp) {
          ed.warned = true;
          ed.error = `${ed.id} changed since you started editing. cmd-Enter again saves over it.`;
          cx.notify();
          return;
        }
        await call("bakers_ticket_update", {
          ticket: ed.id,
          title: ed.title.value(),
          description: ed.description.value(),
        });
        this.state = null;
        await done();
      } catch (/** @type {any} */ e) {
        ed.error = `Not saved: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  render() {
    const ed = this.state;
    if (!ed) return null;
    const t = theme();
    const field = (/** @type {string} */ id) =>
      div()
        .id(id)
        .p(8)
        .rounded(6)
        .border(1)
        .border_color(t.border)
        .bg(t.surface)
        .text_color(t.foreground);
    return v_flex()
      .id("editor")
      .gap(8)
      .child(field("edit-title").text_size(22).font_semibold().child(Input.new(ed.title).w_full()))
      .child(heading("Description"))
      .child(field("edit-description").text_size(13).child(Textarea.new(ed.description).w_full()))
      .when(Boolean(ed.error), (el) =>
        el.child(div().text_size(11).text_color(t.blocked).child(ed.error)),
      )
      .child(div().text_size(11).text_color(t.muted).child("cmd-Enter saves, Esc cancels"));
  }
}
