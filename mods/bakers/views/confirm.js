// The confirm dialogs (AC6): change state and freeze/unfreeze follow frame 4, move and
// cancel run follow R3-2. From and to in pills, one paragraph with the consequence, then
// the buttons: the primary names the action and its target, the other names what stays.
// The non-writing button is the default (Enter) and Esc; nothing is written before the
// primary button.
import { div, svg } from "gpui-kit";
import { h_flex, Input, InputState, Textarea, TextareaState, v_flex } from "gpui-base";
import { closeOverlay, notify, props, theme } from "herdr";
import { refresh } from "../lib/actions.js";
import { api, getStore, ready } from "../lib/context.js";
import { button, icons, UI_FONT } from "../lib/theme.js";

const CLOSING = ["done", "cancelled"];

/** @param {string} id @param {string} from @param {string} to @param {string | null} branch */
export function consequence(id, from, to, branch) {
  if (CLOSING.includes(to)) return `This closes ${id}. A closed ticket cannot be changed any more.`;
  const back = from ? ` You can move it back to ${from} later.` : "";
  if (to === "working")
    return `A conductor picks ${id} up and the agent starts coding${branch ? ` on branch ${branch}` : ""}.${back}`;
  if (to === "qualification")
    return `The agent qualifies ${id} again before anything else happens.${back}`;
  if (to === "plan")
    return `A run writes a new plan for ${id}; the old plan stays in Comments.${back}`;
  if (to === "review") return `The review run or a reviewer checks the branch of ${id}.${back}`;
  return `${id} moves to ${to}.${back}`;
}

export default class Confirm {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.comment = TextareaState.new({ placeholder: "", rows: 2 });
    this.reason = InputState.new({ placeholder: "" });
    this.error = null;
    this.busy = false;
    this.branch = null;
    cx.spawn(async (cx) => {
      try {
        await ready();
        const d = await getStore().ticket(props().ticket);
        this.branch = d?.ticket?.branch_name ?? null;
        this.from = props().from ?? d?.ticket?.state;
      } catch {
        // the dialog works without the branch
      }
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  /** What the primary button writes, in order. */
  async write() {
    const p = props();
    const id = p.ticket;
    if (p.kind === "state") {
      const body = this.comment.value().trim();
      if (body) await api.publishComment(id, body, "comment");
      await api.transitionTicket(id, p.to);
      return `${id} moved to ${p.to}`;
    }
    if (p.kind === "freeze") {
      await api.updateTicket(id, { frozen: true });
      return `${id} frozen`;
    }
    if (p.kind === "unfreeze") {
      await api.updateTicket(id, { frozen: false });
      return `${id} unfrozen`;
    }
    if (p.kind === "cancel") {
      await api.cancelRun(id, this.reason.value().trim() || "Cancelled from Herdr");
      return `Run of ${id} cancelled`;
    }
    if (p.kind === "move") {
      await api.cancelRun(id, this.reason.value().trim() || `Moved to ${p.name}`);
      try {
        await api.updateTicket(id, { conductor: p.conductor });
      } catch (/** @type {any} */ e) {
        throw new Error(`Run cancelled, not started on ${p.name}: ${e?.message ?? e}`);
      }
      return `${id} runs on ${p.name}`;
    }
    return null;
  }

  /** @param {any} cx */
  confirm(cx) {
    if (this.busy) return;
    this.busy = true;
    this.error = null;
    cx.spawn(async (cx) => {
      try {
        const done = await this.write();
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

  copy() {
    const p = props();
    const id = p.ticket;
    const from = p.from ?? this.from ?? "";
    if (p.kind === "state")
      return {
        title: `Move ${id} to ${p.to}?`,
        size: 16,
        pills: [from, p.to],
        text: consequence(id, from, p.to, this.branch),
        field: "comment",
        hint: `Esc keeps it in ${from}`,
        keep: `Keep in ${from}`,
        act: `Move to ${p.to}`,
        primaryFirst: CLOSING.includes(p.to),
      };
    if (p.kind === "freeze")
      return {
        title: `Freeze ${id}?`,
        size: 15,
        text: "No conductor picks it up while it is frozen. A run that is already running continues until it ends.",
        keep: "Keep",
        act: "Freeze",
        primaryFirst: true,
        keepSolid: true,
      };
    if (p.kind === "unfreeze")
      return {
        title: `Unfreeze ${id}?`,
        size: 15,
        text: "A conductor can pick it up again. The label Question stays until you remove it.",
        keep: "Keep frozen",
        act: "Unfreeze",
        primaryFirst: true,
        keepSolid: true,
      };
    if (p.kind === "cancel")
      return {
        title: `Cancel the run of ${id}?`,
        size: 16,
        text: "The run stops now. Its work stays in the worktree on its branch; no new run starts until a conductor picks the ticket up again.",
        field: "reason",
        label: "Reason, optional, recorded on the cancelled run",
        hint: "Esc keeps it running",
        keep: "Keep running",
        act: "Cancel run",
      };
    return {
      title: `Move ${id} to ${p.name}?`,
      size: 16,
      pills: ["its conductor", p.name],
      text: `First the running run is cancelled; its work stays in the worktree${this.branch ? ` on branch ${this.branch}` : ""}. Then a run starts on ${p.name}. The agent there begins from the branch, not from the old run's conversation.`,
      field: "reason",
      label: "Reason, optional, recorded on the cancelled run",
      hint: "Esc keeps it on its conductor",
      keep: "Keep on its conductor",
      act: `Cancel and run on ${p.name}`,
    };
  }

  render() {
    const t = theme();
    const c = this.copy();
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
      .child(div().text_size(c.size).font_semibold().child(c.title))
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
            .child(
              div()
                .p(8)
                .rounded(6)
                .border(1)
                .border_color(t.border)
                .bg(t.surface)
                .text_size(12)
                .child(Textarea.new(this.comment).w_full()),
            ),
        ),
      )
      .when(c.field === "reason", (el) =>
        el.child(
          v_flex()
            .gap(4)
            .child(div().text_size(11).text_color(t.muted).child(c.label))
            .child(
              h_flex()
                .h(28)
                .px(8)
                .items_center()
                .rounded(6)
                .border(1)
                .border_color(t.border)
                .bg(t.surface)
                .text_size(12)
                .child(Input.new(this.reason).w_full()),
            ),
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
