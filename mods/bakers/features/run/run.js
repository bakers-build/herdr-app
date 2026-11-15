// features/run: the ticket's run. Show agent focuses the run's terminal (agent.focus on
// the terminal labelled bakers.ticket); Move to... picks a conductor (bakers_conductor_list)
// and asks with the R3-2 dialog before run_cancel and ticket_update conductor; Cancel run...
// asks before run_cancel. The panel's Agent and conductor section draws all three.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { openOverlay, props, run, theme } from "herdr";
import { machineOf, NO_TERMINAL, runTerminal } from "../../core/agent.js";
import { call } from "../../core/cli.js";
import { defineDialog, openDialog } from "../../core/dialog.js";
import { age, toMs } from "../../core/format.js";
import { button, chip, dot, heading } from "../../core/kit.js";
import { PopupList } from "../../core/menu.js";
import { getStore, ready } from "../../core/session.js";

/** The run's terminal on this computer, if Herdr shows it. @param {any} detail */
export const terminalOf = (detail) => runTerminal(detail?.ticket?.identifier, detail?.ticket?.id);

/** Show agent (G) and Answer in the run. @param {any} detail */
export function showAgent(detail) {
  const t = terminalOf(detail);
  if (t) run("agent.focus", { terminal: t.address });
}

/** A button that shows the agent, or is disabled and says why. @param {string} id @param {string} label @param {any} detail @param {any} [o] */
export function showAgentButton(id, label, detail, o = {}) {
  return terminalOf(detail)
    ? button(id, label, () => showAgent(detail), o)
    : button(id, label, null, { ...o, disabled: true, reason: NO_TERMINAL });
}

/** Move to... (R): the conductor picker first. @param {string} id */
export function openMove(id) {
  openOverlay({
    mod: "bakers",
    props: { view: "conductor-picker", ticket: id },
    kind: "popup",
    width: 220,
  });
}

/** @param {string} id */
export function askCancel(id) {
  openDialog("cancel", { ticket: id });
}

/** The "..." menu item. @param {any} detail */
export function cancelItem(detail) {
  return {
    label: "Cancel run...",
    action: ["dialog", "cancel", { ticket: detail.ticket.identifier }],
    disabled: !detail.runs?.some((/** @type {any} */ r) => !r.closed),
  };
}

defineDialog("move", {
  copy: (p, ctx) => ({
    title: `Move ${p.ticket} to ${p.name}?`,
    size: 16,
    pills: ["its conductor", p.name],
    text: `First the running run is cancelled; its work stays in the worktree${ctx.branch ? ` on branch ${ctx.branch}` : ""}. Then a run starts on ${p.name}. The agent there begins from the branch, not from the old run's conversation.`,
    field: "reason",
    label: "Reason, optional, recorded on the cancelled run",
    hint: "Esc keeps it on its conductor",
    keep: "Keep on its conductor",
    act: `Cancel and run on ${p.name}`,
  }),
  write: async (p, inputs) => {
    await call("bakers_run_cancel", {
      ticket: p.ticket,
      reason: inputs.reason || `Moved to ${p.name}`,
    });
    try {
      await call("bakers_ticket_update", { ticket: p.ticket, conductor: p.conductor });
    } catch (/** @type {any} */ e) {
      throw new Error(`Run cancelled, not started on ${p.name}: ${e?.message ?? e}`);
    }
    return `${p.ticket} runs on ${p.name}`;
  },
});

defineDialog("cancel", {
  copy: (p) => ({
    title: `Cancel the run of ${p.ticket}?`,
    size: 16,
    text: "The run stops now. Its work stays in the worktree on its branch; no new run starts until a conductor picks the ticket up again.",
    field: "reason",
    label: "Reason, optional, recorded on the cancelled run",
    hint: "Esc keeps it running",
    keep: "Keep running",
    act: "Cancel run",
  }),
  write: async (p, inputs) => {
    await call("bakers_run_cancel", {
      ticket: p.ticket,
      reason: inputs.reason || "Cancelled from Herdr",
    });
    return `Run of ${p.ticket} cancelled`;
  },
});

/** The view "conductor-picker"; the API chip when the CLI has no conductor list. */
export class ConductorPicker extends PopupList {
  init(p, cx) {
    super.init(p, cx);
    this.conductors = null;
    this.served = true;
    cx.spawn(async (cx) => {
      try {
        const project = await ready();
        this.conductors =
          (await call("bakers_conductor_list", { project: project?.uuid ?? getStore().project }))
            ?.conductors ?? [];
      } catch (/** @type {any} */ e) {
        this.conductors = [];
        this.served = !e?.unknownTool;
      }
      cx.notify();
    });
  }

  items() {
    return (this.conductors ?? []).map((/** @type {any} */ c) => ({
      key: c.uuid ?? c.id,
      label: c.name ?? c.uuid,
      hint: c.machine ?? "",
      choose: () => {
        this.close();
        openDialog("move", {
          ticket: props().ticket,
          conductor: c.uuid ?? c.id,
          name: c.name ?? c.uuid,
        });
      },
    }));
  }

  bottom(t) {
    if (this.served) return null;
    return h_flex()
      .gap(4)
      .items_center()
      .px(8)
      .py(6)
      .text_color(t.muted)
      .child(chip())
      .child("The conductor list needs the bakers API.");
  }
}

/** The panel's Agent and conductor section. @param {any} detail */
export function agentSection(detail) {
  const t = theme();
  const id = detail.ticket.identifier;
  const where = machineOf(terminalOf(detail));
  const active = detail.runs.find((/** @type {any} */ r) => !r.closed);
  const since = detail.why === "Asked a question" ? detail.since : toMs(active?.started_at);
  const rest = [where ? `on ${where}` : null, since != null ? age(Date.now() - since) : null]
    .filter(Boolean)
    .join(", ");
  const tone = detail.agent.tone;
  const small = { h: 24, size: 11 };
  return v_flex()
    .id("agent-section")
    .gap(6)
    .child(heading("Agent and conductor"))
    .child(
      h_flex()
        .gap(6)
        .items_center()
        .flex_wrap()
        .text_color(tone === "blocked" ? t.blocked : t.foreground)
        .child(
          dot(
            tone === "blocked" ? "blocked" : tone === "working" ? "working" : "muted",
            !detail.agent.run,
          ),
        )
        .child(div().child(detail.agent.text))
        .when(Boolean(rest), (el) => el.child(div().text_color(t.muted).child(rest))),
    )
    .child(
      h_flex()
        .gap(6)
        .flex_wrap()
        .child(showAgentButton("show-agent", "Show agent", detail, small))
        .child(button("move-to", "Move to...", () => openMove(id), small))
        .child(
          button(
            "cancel-run",
            "Cancel run...",
            active ? () => askCancel(id) : null,
            active ? small : { ...small, disabled: true, reason: "No run is active" },
          ),
        ),
    )
    .child(div().text_size(11).text_color(t.muted).child("R moves, G shows the agent."));
}
