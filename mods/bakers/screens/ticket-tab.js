// screens/ticket-tab: a ticket as its own tab (frame R2-3), one column of at most 760 px.
// It composes the slices: the header (features/state pill, features/freeze pill,
// features/document agent line, Edit, "..."), the title and description
// (features/document) or the editor (features/edit), the Needs-you card (features/needs)
// with its actions (features/answer, features/run, features/state), the comments, and the
// composer (features/answer). Keys: A acts on the card, E edits, G shows the agent, R
// moves the run; cmd-Enter and Esc go to the editor or the composer first.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, theme } from "herdr";
import { button, mono, UI_FONT } from "../core/kit.js";
import { openMenu } from "../core/menu.js";
import { getStore, ready } from "../core/session.js";
import { pin } from "../core/tabs.js";
import { Composer } from "../features/answer/composer.js";
import { agentLine, Comments, description, title } from "../features/document/document.js";
import { Editor } from "../features/edit/editor.js";
import { freezeItem, frozenPill } from "../features/freeze/freeze.js";
import { needsCard } from "../features/needs/card.js";
import {
  cancelItem,
  openMove,
  showAgent,
  showAgentButton,
  terminalOf,
} from "../features/run/run.js";
import { approvePlan, statePill } from "../features/state/state.js";

export default class TicketTab {
  init(_props, cx) {
    this.id = props()?.ticket;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.detail = null;
    this.error = null;
    this.comments = new Comments();
    this.editor = new Editor({ onType: () => pin(this.id) });
    this.composer = new Composer({ onChange: () => pin(this.id) });
    this.reload = () => this.load();
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
    });
  }

  async load() {
    try {
      await ready();
      this.detail = await getStore().ticket(this.id);
      this.error = null;
    } catch (/** @type {any} */ e) {
      this.error = e?.message ?? String(e);
    }
  }

  edit() {
    if (this.detail) this.editor.start(this.detail.ticket);
  }

  /** A: answer a question, approve a plan. */
  act() {
    const d = this.detail;
    if (d?.why === "Asked a question") this.composer.answer();
    else if (d?.why === "Plan ready for approval") approvePlan(this.id, d.ticket.state);
  }

  /** @param {any} e @param {any} cx */
  onKey(e, cx) {
    const k = e.keystroke;
    const handled =
      this.editor.key(k, cx, this.reload) ||
      this.composer.key(k, this.id, cx, this.reload) ||
      (!this.editor.active && !this.composer.focused && this.letter(k));
    if (!handled) return;
    cx.stop_propagation();
    cx.notify();
  }

  /** @param {string} k */
  letter(k) {
    if (k === "a") this.act();
    else if (k === "e") this.edit();
    else if (k === "g") showAgent(this.detail);
    else if (k === "r") openMove(this.id);
    else return false;
    return true;
  }

  header() {
    const tk = this.detail.ticket;
    return h_flex()
      .id("doc-header")
      .items_center()
      .gap(8)
      .flex_wrap()
      .child(mono(tk.identifier, 12).font_semibold())
      .child(statePill(tk))
      .when(Boolean(tk.frozen), (el) => el.child(frozenPill()))
      .child(agentLine(this.detail, terminalOf(this.detail)))
      .child(div().flex_1())
      .child(button("edit", "Edit", () => this.edit(), { h: 24, size: 12 }))
      .child(
        button(
          "more",
          "...",
          () =>
            openMenu([
              freezeItem(tk),
              cancelItem(this.detail),
              { label: "Copy identifier", action: ["copy", tk.identifier], separator: true },
            ]),
          {
            h: 24,
            px: 0,
          },
        )
          .w(24)
          .justify_center(),
      );
  }

  card() {
    const d = this.detail;
    return needsCard(d, {
      question: [
        button(
          "answer-below",
          "Answer below",
          (_e, cx) => {
            this.composer.answer();
            cx.notify();
          },
          { primary: true },
        ),
        showAgentButton("answer-in-run", "Answer in the run", d),
      ],
      plan: [button("approve-plan", "Approve plan...", () => this.act(), { primary: true })],
    });
  }

  render() {
    const t = theme();
    const root = v_flex()
      .id("ticket")
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .font_family(UI_FONT)
      .text_size(13)
      .text_color(t.foreground)
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.onKey(e, cx));
    if (!this.detail)
      return root.child(
        div()
          .p(24)
          .text_color(this.error ? t.blocked : t.muted)
          .child(this.error ?? `Loading ${this.id}...`),
      );
    const tk = this.detail.ticket;
    const onEdit = (/** @type {any} */ cx) => {
      this.edit();
      cx.notify();
    };
    const editor = this.editor.render();
    const card = this.card();
    return root
      .child(
        h_flex()
          .id("doc-scroll")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .px(24)
          .py(20)
          .justify_center()
          .child(
            v_flex()
              .id("doc")
              .w_full()
              .max_w(760)
              .gap(16)
              .child(this.header())
              .when(!editor, (el) => el.child(title(tk, onEdit)))
              .when(Boolean(card), (el) => el.child(card))
              .when(Boolean(editor), (el) => el.child(editor))
              .when(!editor, (el) => el.child(description(tk, onEdit)))
              .child(this.comments.render(this.detail)),
          ),
      )
      .child(
        this.composer.render({
          send: (cx) => this.composer.send(this.id, cx, this.reload),
          comment: (cx) => this.composer.comment(this.id, cx, this.reload),
        }),
      );
  }
}
