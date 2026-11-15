// features/state: the state pill of a ticket tab, the state menu (every state; the API
// cannot say which ones the workflow allows), and the change-state dialog of frame 4:
// an optional comment, then bakers_ticket_transition. Approve plan... is the dialog from
// plan to working.
import { svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { call } from "../../core/cli.js";
import { defineDialog, openDialog } from "../../core/dialog.js";
import { icons } from "../../core/kit.js";
import { openMenu } from "../../core/menu.js";
import { cap } from "../../core/views.js";

const ALL = ["qualification", "plan", "working", "review", "done", "cancelled"];
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

defineDialog("state", {
  copy: (p, ctx) => {
    const from = p.from ?? ctx.from ?? "";
    return {
      title: `Move ${p.ticket} to ${p.to}?`,
      size: 16,
      pills: [from, p.to],
      text: consequence(p.ticket, from, p.to, ctx.branch),
      field: "comment",
      hint: `Esc keeps it in ${from}`,
      keep: `Keep in ${from}`,
      act: `Move to ${p.to}`,
      primaryFirst: CLOSING.includes(p.to),
    };
  },
  write: async (p, inputs) => {
    if (inputs.comment)
      await call("bakers_comment_publish", {
        ticket: p.ticket,
        type: "comment",
        body: inputs.comment,
      });
    await call("bakers_ticket_transition", { ticket: p.ticket, state: p.to });
    return `${p.ticket} moved to ${p.to}`;
  },
});

/** The state menu's items. @param {string} id @param {string} current */
export function stateItems(id, current) {
  return ALL.map((s) => ({
    key: s,
    label: s === current ? cap(s) : `${cap(s)}...`,
    current: s === current,
    hint: s === current ? "current" : undefined,
    disabled: s === current,
    action: ["dialog", "state", { ticket: id, from: current, to: s }],
  }));
}

/** @param {string} id @param {string} current */
export function openStateMenu(id, current) {
  openMenu(stateItems(id, current), {
    footer: "All states shown; the server refuses what the workflow forbids.",
    footerApi: true,
  });
}

/** A on a plan card: plan to working, asked first. @param {string} id @param {string} from */
export function approvePlan(id, from) {
  openDialog("state", { ticket: id, from, to: "working" });
}

/** The pill in the ticket tab's header. @param {any} ticket */
export function statePill(ticket) {
  const t = theme();
  return h_flex()
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
    .on_click(() => openStateMenu(ticket.identifier, ticket.state))
    .child(ticket.state)
    .child(svg(icons.down).size(10));
}
