// ui/ticket-tab: a ticket as its own tab (frame R2-3), one column of at most 760 px. It loads
// the ticket (entity/ticket/data), maps it with presenter/full, and draws the header, the
// title and description (or the edit form), the Needs-you card, the comments and the
// composer (the comment form). Keys: A acts on the card, E edits, G shows the agent, R moves
// the run; cmd-Enter and Esc belong to the edit form or the composer while they are used.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { notify, openOverlay, props, run, theme } from "herdr";
import { NO_TERMINAL, runTerminal } from "../core/herdr.js";
import { pin } from "../core/tabs.js";
import { UI_FONT } from "../core/theme.js";
import { formKey } from "../form/keys.js";
import { FormState } from "../form/state.js";
import { submit } from "../form/submit.js";
import { button } from "../components/button.js";
import { callout } from "../components/callout.js";
import { entry } from "../components/entry.js";
import { openForm } from "../components/form/dialog.js";
import { inlineForm } from "../components/form/inline.js";
import { FormInputs } from "../components/form/inputs.js";
import { markdown } from "../components/markdown.js";
import { openMenu } from "../components/menu.js";
import { pill } from "../components/pill.js";
import { failureView, loading } from "../components/state.js";
import { statusLine } from "../components/status-line.js";
import { heading, mono } from "../components/text.js";
import { classify } from "../core/errors.js";
import { getStore, ready } from "../entity/ticket/data.js";
import { commentForm } from "../entity/ticket/form/comment.js";
import { editForm } from "../entity/ticket/form/edit.js";
import { full } from "../entity/ticket/presenter/full.js";
import { STATE_MENU_FOOTER, stateItems } from "../entity/ticket/presenter/states.js";

/** A form in place: its definition, state and inputs. */
class Inline {
  /** @param {any} def @param {() => void} [onType] */
  constructor(def, onType) {
    this.def = def;
    this.state = new FormState(def);
    this.inputs = new FormInputs(def, this.state, onType);
    this.focused = false;
    /** @type {string | null} */
    this.mode = null;
    const text = Object.values(this.inputs.inputs)[0];
    text?.on("focus", () => {
      this.focused = true;
    });
    text?.on("blur", () => {
      this.focused = false;
    });
  }
}

export default class TicketTab {
  init(_props, cx) {
    this.id = props()?.ticket;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.detail = null;
    this.failure = null;
    this.open = new Set();
    this.editor = null;
    this.composer = this.makeComposer("comment");
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
    });
  }

  /** @param {"comment" | "answer"} mode @param {string} [text] */
  makeComposer(mode, text = "") {
    const c = new Inline(commentForm(this.id, mode, text), () => pin(this.id));
    c.mode = mode;
    return c;
  }

  async load() {
    try {
      await ready();
      this.detail = await getStore().ticket(this.id);
      this.failure = null;
    } catch (e) {
      this.failure = classify(e);
    }
  }

  terminal() {
    return runTerminal(this.id, this.detail?.ticket?.id);
  }

  showAgent() {
    const t = this.terminal();
    if (t) run("agent.focus", { terminal: t.address });
  }

  answer() {
    if (this.composer.mode !== "answer")
      this.composer = this.makeComposer("answer", this.composer.state.values.body);
    this.composer.inputs.focus("body");
  }

  plain() {
    if (this.composer.mode !== "comment")
      this.composer = this.makeComposer("comment", this.composer.state.values.body);
  }

  edit() {
    if (this.detail && !this.editor) {
      this.editor = new Inline(editForm(this.detail.ticket), () => pin(this.id));
      this.editor.inputs.focus("title");
    }
  }

  /** A: answer a question, approve a plan. */
  act() {
    const d = this.detail;
    if (d?.why === "Asked a question") this.answer();
    else if (d?.why === "Plan ready for approval")
      openForm("state", { ticket: this.id, from: d.ticket.state, to: "working" });
  }

  /** Sends an inline form with a variant; afterwards the composer is plain again. @param {Inline} f @param {string} variant @param {any} cx */
  send(f, variant, cx) {
    f.state.values.variant = variant;
    cx.spawn(async (cx) => {
      const r = await submit(f.def, f.state);
      if (r.ok) {
        if (r.success) notify({ title: r.success, level: "success" });
        if (f === this.editor) this.editor = null;
        else this.composer = this.makeComposer("comment");
        await this.load();
      }
      cx.notify();
    });
  }

  /** @param {any} e @param {any} cx */
  onKey(e, cx) {
    const k = e.keystroke;
    const active = this.editor ?? (this.composer.focused ? this.composer : null);
    if (active) {
      const what = formKey(k, "inline");
      if (what === "submit") this.send(active, active.def.defaultVariant, cx);
      else if (what === "cancel") {
        if (active === this.editor) this.editor = null;
        else this.plain();
      } else return;
    } else if (k === "a") this.act();
    else if (k === "e") this.edit();
    else if (k === "g") this.showAgent();
    else if (k === "r")
      openOverlay({
        mod: "bakers",
        props: { view: "conductor-picker", ticket: this.id },
        kind: "popup",
        width: 220,
      });
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  /** @param {any} vm */
  header(vm) {
    const tk = this.detail.ticket;
    const run = this.detail.runs.some((/** @type {any} */ r) => !r.closed);
    return h_flex()
      .id("doc-header")
      .items_center()
      .gap(8)
      .flex_wrap()
      .child(mono(vm.id, 12).font_semibold())
      .child(
        pill(vm.state, {
          id: "state-pill",
          chevron: true,
          size: 11,
          onClick: () =>
            openMenu(stateItems(vm.id, vm.state), { footer: STATE_MENU_FOOTER, footerApi: true }),
        }),
      )
      .when(vm.frozen, (el) => el.child(pill("Frozen", { strong: true, size: 11 })))
      .child(
        statusLine("agent-line", {
          tone: vm.agent.tone,
          ring: vm.agent.ring,
          text: vm.agent.line,
          size: 12,
        }),
      )
      .child(div().flex_1())
      .child(button("edit", "Edit", () => this.edit(), { h: 24, size: 12 }))
      .child(
        button(
          "more",
          "...",
          () =>
            openMenu([
              {
                label: tk.frozen ? "Unfreeze..." : "Freeze...",
                action: ["form.open", tk.frozen ? "unfreeze" : "freeze", { ticket: vm.id }],
              },
              {
                label: "Cancel run...",
                action: ["form.open", "cancel", { ticket: vm.id }],
                disabled: !run,
              },
              { label: "Copy identifier", action: ["copy", vm.id], separator: true },
            ]),
          { h: 24, px: 0 },
        )
          .w(24)
          .justify_center(),
      );
  }

  /** @param {any} card */
  card(card) {
    if (!card) return null;
    const term = this.terminal();
    const buttons =
      card.kind === "question"
        ? [
            button(
              "answer-below",
              "Answer below",
              (_e, cx) => {
                this.answer();
                cx.notify();
              },
              { primary: true },
            ),
            button(
              "answer-in-run",
              "Answer in the run",
              term ? () => this.showAgent() : null,
              term ? {} : { disabled: true, reason: NO_TERMINAL },
            ),
          ]
        : card.kind === "plan"
          ? [button("approve-plan", "Approve plan...", () => this.act(), { primary: true })]
          : [];
    return callout("needs-card", card, buttons);
  }

  /** @param {any} vm */
  document(vm) {
    const t = theme();
    const onEdit = (/** @type {any} */ _e, /** @type {any} */ cx) => {
      this.edit();
      cx.notify();
    };
    const card = this.card(vm.needs);
    return v_flex()
      .id("doc")
      .w_full()
      .max_w(760)
      .gap(16)
      .child(this.header(vm))
      .when(!this.editor, (el) =>
        el.child(
          div()
            .id("title")
            .text_size(22)
            .font_semibold()
            .line_height(27.5)
            .on_click(onEdit)
            .child(vm.title),
        ),
      )
      .when(Boolean(card), (el) => el.child(card))
      .when(Boolean(this.editor), (el) =>
        el.child(
          inlineForm("editor", this.editor.def, this.editor.inputs, (v, cx) =>
            this.send(this.editor, v, cx),
          ),
        ),
      )
      .when(!this.editor, (el) =>
        el.child(
          v_flex()
            .id("description")
            .gap(8)
            .child(heading("Description"))
            .child(
              div()
                .id("description-body")
                .cursor_text()
                .on_click(onEdit)
                .child(markdown(`desc-${vm.id}`, vm.description)),
            )
            .child(div().text_size(11).text_color(t.muted).child("Click or E to edit.")),
        ),
      )
      .child(
        v_flex()
          .id("comments")
          .gap(10)
          .child(heading(vm.commentsHeading))
          .children(
            vm.comments.map((/** @type {any} */ c) =>
              entry(c, this.open.has(c.key), (cx) => {
                if (this.open.has(c.key)) this.open.delete(c.key);
                else this.open.add(c.key);
                cx.notify();
              }),
            ),
          ),
      );
  }

  composerView() {
    const t = theme();
    const answering = this.composer.mode === "answer";
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
          .child(
            inlineForm("composer-form", this.composer.def, this.composer.inputs, (v, cx) =>
              this.send(this.composer, v, cx),
            ),
          ),
      );
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
        this.failure
          ? failureView(this.failure, (_e, cx) =>
              cx.spawn(async (cx) => {
                await this.load();
                cx.notify();
              }),
            )
          : loading(`Loading ${this.id}...`),
      );
    const vm = full(this.detail, { terminal: this.terminal(), now: Date.now() });
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
          .child(this.document(vm)),
      )
      .child(this.composerView());
  }
}
