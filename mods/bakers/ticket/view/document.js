// ticket/view/document: one ticket's document in the panel (view/context.js): the header (ID, state
// pill and its menu, Frozen, the agent line, Edit, Actions, ...), the title or the edit form, the
// Needs-you card, the comments and the composer (the comment form). Keys: A acts
// on the card, E edits, G shows the agent, R moves the run; cmd-Enter and Esc belong to the edit
// form or the composer while they are used. It never takes the focus on its own.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { notify, run } from "herdr";
import { runReason, runTerminal, showAgent } from "../terminal.js";
import { ticketActions } from "../operations/actions.js";
import { perform } from "../../core/actions.js";
import { classify } from "../../core/errors.js";
import { tokens } from "../../ui/theme.js";
import { formKey } from "../../form/keys.js";
import { FormState } from "../../form/state.js";
import { submit } from "../../form/submit.js";
import { button } from "../../ui/components/button.js";
import { callout } from "../../ui/components/callout.js";
import { entry } from "../../ui/components/entry.js";
import { openForm } from "../../ui/form/dialog.js";
import { inlineForm } from "../../ui/form/inline.js";
import { FormInputs } from "../../ui/form/inputs.js";
import { openMenu } from "../../ui/components/menu.js";
import { pill } from "../../ui/components/pill.js";
import { failureView } from "../../ui/components/state.js";
import { statusLine } from "../../ui/components/status-line.js";
import { heading, mono } from "../../ui/components/text.js";
import { commentBody } from "../repository.js";
import { getStore, ready } from "../store.js";
import { commentForm } from "../form/comment.js";
import { editForm } from "../form/edit.js";
import { moreItems } from "../operations/more.js";
import { STATE_MENU_FOOTER, stateItems } from "../operations/state.js";

/** A form in place: its definition, state and inputs. */
/** A form in place: its definition, state and inputs. */
class Inline {
  /** @param {any} def */
  constructor(def) {
    this.def = def;
    this.state = new FormState(def);
    this.inputs = new FormInputs(def, this.state);
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

/** One ticket's document: its detail, the open edit form, the composer and the keys. The panel
 *  (view/context.js) makes one per followed ticket and draws its parts. */
export class TicketDocument {
  /** @type {any} */
  detail = null;
  /** @type {import("../../core/errors.js").Failure | null} */
  failure = null;
  /** @type {Set<string>} the expanded entries */
  open = new Set();
  /** @type {import("../../core/errors.js").Failure | null} why the last body could not be read */
  bodyFailure = null;
  /** @type {Inline | null} the open edit form */
  editor = null;
  /** @type {Inline} the comment form; init makes it */
  composer = /** @type {any} */ (null);

  /** @param {string} id @param {() => Promise<void> | void} [reload] the panel's reload after a send */
  constructor(id, reload) {
    this.id = id;
    this.reload = reload ?? (() => this.load());
    this.composer = this.makeComposer("comment");
    this.seed();
  }

  /** Starts from what the store has: the ticket read before, else the list's row (partial). */
  seed() {
    const store = getStore();
    this.detail ??= store.cached(this.id) ?? store.partial(this.id);
  }

  /** The detail is the list's row only: nothing edits or moves the ticket yet. */
  get partial() {
    return Boolean(this.detail?.partial);
  }

  /** @param {"comment" | "answer"} mode @param {string} [text] */
  makeComposer(mode, text = "") {
    const c = new Inline(commentForm(this.id, mode, text));
    c.mode = mode;
    return c;
  }

  async load() {
    try {
      await ready();
      this.seed();
      this.detail = await getStore().ticket(this.id);
      this.failure = null;
    } catch (e) {
      this.failure = classify(e);
    }
  }

  /**
   * Opens or folds a comment. The first opening of one read without its body (an older plan, spec
   * or summary) reads that body, once; if it fails the entry stays unread and folded.
   * @param {string} key @param {import("gpui-kit").Context} cx
   */
  toggle(key, cx) {
    if (this.open.has(key)) {
      this.open.delete(key);
      cx.notify();
      return;
    }
    this.open.add(key);
    this.bodyFailure = null;
    const comment = this.detail?.comments?.find((/** @type {any} */ c) => c.id === key);
    if (comment && comment.loaded === false) {
      cx.spawn(async (cx) => {
        try {
          const body = await commentBody(key);
          // A refresh may have replaced the detail meanwhile: write to what is current too.
          const current = [
            comment,
            this.detail?.comments?.find((/** @type {any} */ c) => c.id === key),
            getStore()
              .cached(this.id)
              ?.comments?.find((/** @type {any} */ c) => c.id === key),
          ];
          for (const c of current) if (c) Object.assign(c, { body, loaded: true });
        } catch (e) {
          this.open.delete(key);
          this.bodyFailure = classify(e);
        }
        cx.notify();
      });
    }
    cx.notify();
  }

  terminal() {
    return runTerminal(this.id, this.detail?.ticket?.id);
  }

  runInfo() {
    return { runs: this.detail?.runs ?? [], claim_machine: this.detail?.ticket?.claim_machine };
  }

  showAgent() {
    if (this.terminal()) showAgent(this.id);
  }

  /** The ticket action a single key (G, R) runs, from the one list of actions. @param {string} k */
  keyAction(k) {
    if (!this.detail || this.partial) return null;
    const reason = runReason(this.runInfo(), this.terminal());
    return ticketActions(this.detail, reason).find((a) => a.keys?.toLowerCase() === k) ?? null;
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
    if (this.detail && !this.partial && !this.editor) {
      this.editor = new Inline(editForm(this.detail.ticket));
      this.editor.inputs.focus("title");
    }
  }

  /** A: answer a question, approve a plan. */
  act() {
    const d = this.detail;
    if (this.partial) return;
    if (d?.why === "Asked a question") this.answer();
    else if (d?.why === "Plan ready for approval")
      openForm("state", { ticket: this.id, from: d.ticket.state, to: "working" });
  }

  /** Sends an inline form with a variant; afterwards the composer is plain again. @param {Inline} f @param {string} variant @param {import("gpui-kit").Context} cx */
  send(f, variant, cx) {
    f.state.values.variant = variant;
    cx.spawn(async (cx) => {
      const r = await submit(f.def, f.state);
      if (r.ok) {
        if (r.success) notify({ title: r.success, level: "success" });
        if (f === this.editor) this.editor = null;
        else this.composer = this.makeComposer("comment");
        await this.reload();
      }
      cx.notify();
    });
  }

  /** The panel's keys; true when one acted. @param {any} e @param {any} cx @returns {boolean} */
  onKey(e, cx) {
    const k = e.keystroke;
    if (this.partial) return false;
    const active = this.editor ?? (this.composer.focused ? this.composer : null);
    if (active) {
      const what = formKey(k, "inline");
      if (what === "submit") this.send(active, active.def.defaultVariant, cx);
      else if (what === "cancel") {
        if (active === this.editor) this.editor = null;
        else this.plain();
      } else return false;
    } else if (k === "a") this.act();
    else if (k === "e") this.edit();
    else {
      const op = this.keyAction(k);
      if (!op) return false;
      if (!op.reason && op.action) void perform(op.action, cx);
    }
    return true;
  }

  /** @param {any} vm */
  header(vm) {
    const wait = this.partial;
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
            wait ||
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
      .child(
        button("edit", "Edit", wait ? null : () => this.edit(), {
          h: 24,
          size: 12,
          disabled: wait,
        }),
      )
      .child(
        button("actions", "Actions", wait ? null : () => run("bakers.actions"), {
          h: 24,
          size: 12,
          disabled: wait,
        }),
      )
      .child(
        button("more", "...", wait ? null : () => openMenu(moreItems(this.detail)), {
          h: 24,
          px: 0,
          disabled: wait,
        })
          .w(24)
          .justify_center(),
      );
  }

  /** @param {any} card */
  card(card) {
    if (!card) return null;
    const why = runReason(this.runInfo(), this.terminal());
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
              why ? null : () => this.showAgent(),
              why ? { disabled: true, reason: why } : {},
            ),
          ]
        : card.kind === "plan"
          ? [button("approve-plan", "Approve plan...", () => this.act(), { primary: true })]
          : [];
    return callout("needs-card", card, buttons);
  }

  /** The title, or the edit form in its place while editing. @param {any} vm */
  title(vm) {
    const editor = this.editor;
    if (editor)
      return inlineForm("editor", editor.def, editor.inputs, (v, cx) => this.send(editor, v, cx));
    return div()
      .id("title")
      .text_size(18)
      .font_semibold()
      .line_height("23px")
      .on_click((_e, cx) => {
        this.edit();
        cx.notify();
      })
      .child(vm.title);
  }

  /** @param {any} vm */
  comments(vm) {
    return v_flex()
      .id("comments")
      .gap(10)
      .child(heading(vm.commentsHeading))
      .when(Boolean(this.bodyFailure), (el) =>
        el.child(failureView(/** @type {any} */ (this.bodyFailure), null)),
      )
      .children(
        vm.comments.map((/** @type {any} */ c) =>
          entry(c, this.open.has(c.key), (cx) => this.toggle(c.key, cx)),
        ),
      );
  }

  composerView() {
    const t = tokens();
    const answering = this.composer.mode === "answer";
    return h_flex()
      .id("composer")
      .flex_none()
      .justify_center()
      .px(12)
      .py(10)
      .when(answering, (el) => el.border_t_2().border_color(t.accent))
      .when(!answering, (el) => el.border_t(1).border_color(t.border))
      .child(
        v_flex()
          .w_full()
          .child(
            inlineForm("composer-form", this.composer.def, this.composer.inputs, (v, cx) =>
              this.send(this.composer, v, cx),
            ),
          ),
      );
  }
}
