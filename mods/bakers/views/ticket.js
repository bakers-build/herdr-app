// A ticket as its own tab (frame R2-3): one column of at most 760 px with the header
// (identifier, state pill, Frozen, agent line, Edit, "..."), the title, the Needs-you
// card, the Markdown description, the comments (newest last; plan, spec and summary
// folded to their first line) and the composer at the bottom.
// Keys: A acts on the card, E edits, G shows the agent; cmd-Enter and Esc in the composer.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, run, theme } from "herdr";
import { machineOf, NO_TERMINAL, runTerminal } from "../lib/agent.js";
import { getStore, ready } from "../lib/context.js";
import { age, firstLine, toMs } from "../lib/format.js";
import { renderMarkdown } from "../lib/markdown.js";
import { openConfirm, openMenu, openPicker } from "../lib/overlay.js";
import { button, dot, heading, icons, mono, UI_FONT } from "../lib/theme.js";
import { Composer } from "./composer.js";

const FOLDED = ["plan", "spec", "summary"];

export default class Ticket {
  init(_props, cx) {
    this.id = props()?.ticket;
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.detail = null;
    this.error = null;
    this.open = new Set();
    this.editing = null;
    this.composer = new Composer({ onChange: () => this.onType() });
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

  /** Overridden by the composer task: the first keystroke pins the tab. */
  onType() {}

  terminal() {
    return runTerminal(this.id, this.detail?.ticket?.id);
  }

  showAgent() {
    const t = this.terminal();
    if (t) run("agent.focus", { terminal: t.address });
  }

  /** A: answer a question, approve a plan. */
  act() {
    const why = this.detail?.why;
    if (why === "Asked a question") this.composer.answer();
    else if (why === "Plan ready for approval")
      openConfirm("state", { ticket: this.id, from: this.detail.ticket.state, to: "working" });
  }

  stateMenu() {
    openPicker("state", { ticket: this.id, current: this.detail?.ticket?.state });
  }

  moreMenu() {
    const tk = this.detail?.ticket ?? {};
    openMenu([
      {
        label: tk.frozen ? "Unfreeze..." : "Freeze...",
        action: ["confirm", tk.frozen ? "unfreeze" : "freeze", this.id],
      },
      {
        label: "Cancel run...",
        action: ["confirm", "cancel", this.id],
        disabled: !this.detail?.runs?.some((r) => !r.closed),
      },
      { label: "Copy identifier", action: ["copy", this.id], separator: true },
    ]);
  }

  /** Overridden by the edit task. */
  edit() {}

  /** @param {any} e @param {any} cx */
  onKey(e, cx) {
    if (this.composer.focused || this.editing) return;
    const k = e.keystroke;
    if (k === "a") this.act();
    else if (k === "e") this.edit();
    else if (k === "g") this.showAgent();
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  agentText() {
    const d = this.detail;
    const where = machineOf(this.terminal());
    const run = d.runs.find((r) => !r.closed);
    const since = d.why === "Asked a question" ? d.since : toMs(run?.started_at);
    const parts = [d.agent.text + (where ? ` on ${where}` : "")];
    if (since != null) parts.push(age(Date.now() - since));
    return parts.join(", ");
  }

  header(t) {
    const tk = this.detail.ticket;
    const tone = this.detail.agent.tone;
    return h_flex()
      .id("doc-header")
      .items_center()
      .gap(8)
      .flex_wrap()
      .child(mono(tk.identifier, 12).font_semibold())
      .child(
        h_flex()
          .id("state-pill")
          .h(24)
          .px(8)
          .gap(4)
          .items_center()
          .rounded(12)
          .border(1)
          .border_color(t.border)
          .bg(t.surface)
          .text_size(11)
          .cursor_pointer()
          .on_click(() => this.stateMenu())
          .child(tk.state)
          .child(svg(icons.down).size(10)),
      )
      .when(Boolean(tk.frozen), (el) =>
        el.child(
          h_flex()
            .h(24)
            .px(8)
            .items_center()
            .rounded(12)
            .border(1)
            .border_color(t.foreground)
            .text_size(11)
            .child("Frozen"),
        ),
      )
      .child(
        h_flex()
          .id("agent-line")
          .gap(6)
          .items_center()
          .text_size(12)
          .text_color(tone === "blocked" ? t.blocked : t.muted)
          .child(
            dot(
              tone === "blocked" ? "blocked" : tone === "working" ? "working" : "muted",
              !this.detail.agent.run,
            ),
          )
          .child(this.agentText()),
      )
      .child(div().flex_1())
      .child(button("edit", "Edit", () => this.edit(), { h: 24, size: 12 }))
      .child(
        button("more", "...", () => this.moreMenu(), { h: 24, px: 0 })
          .w(24)
          .justify_center(),
      );
  }

  card(t) {
    const d = this.detail;
    if (!d.why) return null;
    const since = d.since == null ? "" : `, ${age(Date.now() - d.since)} ago`;
    const term = this.terminal();
    const comments = d.comments ?? [];
    let body = "";
    let actions = [];
    if (d.why === "Asked a question") {
      const q =
        [...comments].reverse().find((c) => c.type === "question") ?? comments[comments.length - 1];
      body = q?.body ?? "";
      actions = [
        button(
          "answer-below",
          "Answer below",
          (_e, cx) => {
            this.composer.answer();
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
      ];
    } else if (d.why === "Plan ready for approval") {
      const plan = [...comments].reverse().find((c) => c.type === "plan");
      body = firstLine(plan?.body ?? "");
      actions = [button("approve-plan", "Approve plan...", () => this.act(), { primary: true })];
    } else body = "The branch waits for a review.";
    return v_flex()
      .id("needs-card")
      .gap(8)
      .px(14)
      .py(12)
      .rounded(8)
      .border(1)
      .border_color(t.accent)
      .child(div().text_size(11).font_semibold().text_color(t.accent).child("NEEDS YOU"))
      .child(div().font_semibold().child(`${d.why}${since}`))
      .child(div().text_size(13).child(body))
      .child(
        h_flex()
          .gap(8)
          .flex_wrap()
          .items_center()
          .children(actions)
          .child(div().text_size(11).text_color(t.muted).child("A acts on this card")),
      );
  }

  description(t) {
    const tk = this.detail.ticket;
    return v_flex()
      .id("description")
      .gap(8)
      .child(heading("Description"))
      .child(
        div()
          .id("description-body")
          .cursor_text()
          .on_click((_e, cx) => {
            this.edit();
            cx.notify();
          })
          .child(renderMarkdown(`desc-${tk.identifier}`, tk.description ?? "")),
      )
      .child(div().text_size(11).text_color(t.muted).child("Click or E to edit."));
  }

  comments(t) {
    const list = this.detail.comments ?? [];
    const asking = this.detail.why === "Asked a question";
    const lastQuestion = [...list].reverse().find((c) => c.type === "question");
    return v_flex()
      .id("comments")
      .gap(10)
      .child(heading(`Comments ${list.length}, newest last`))
      .children(
        list.map((c, i) => {
          const key = c.id ?? String(i);
          const folded = FOLDED.includes(c.type) && !this.open.has(key);
          const marked = asking && c === lastQuestion;
          return v_flex()
            .id(`comment-${key}`)
            .gap(3)
            .when(marked, (el) => el.border_l_2().border_color(t.accent).pl(8))
            .when(FOLDED.includes(c.type), (el) =>
              el.cursor_pointer().on_click((_e, cx) => {
                if (this.open.has(key)) this.open.delete(key);
                else this.open.add(key);
                cx.notify();
              }),
            )
            .child(
              h_flex()
                .gap(6)
                .text_size(11)
                .text_color(t.muted)
                .child(
                  div()
                    .font_semibold()
                    .text_color(t.foreground)
                    .child(c.author ?? ""),
                )
                .child(div().child(c.type ?? "comment"))
                .child(div().child(age(Date.now() - (toMs(c.created) ?? Date.now())))),
            )
            .child(
              folded
                ? div().truncate().child(firstLine(c.body))
                : FOLDED.includes(c.type)
                  ? renderMarkdown(`c-${key}`, c.body)
                  : div().child(c.body ?? ""),
            );
        }),
      );
  }

  /** Overridden by the edit task: the title and description fields. */
  editor(_t) {
    return null;
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
    const editor = this.editor(t);
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
              .child(this.header(t))
              .when(!editor, (el) =>
                el.child(
                  div()
                    .id("title")
                    .text_size(22)
                    .font_semibold()
                    .line_height(27.5)
                    .on_click((_e, cx) => {
                      this.edit();
                      cx.notify();
                    })
                    .child(tk.title ?? ""),
                ),
              )
              .when(Boolean(this.card(t)), (el) => el.child(this.card(t)))
              .when(Boolean(editor), (el) => el.child(editor))
              .when(!editor, (el) => el.child(this.description(t)))
              .child(this.comments(t)),
          ),
      )
      .child(this.composer.render({ send: () => this.send(), comment: () => this.comment() }));
  }

  /** Overridden by the composer task. */
  send() {}
  comment() {}
}
