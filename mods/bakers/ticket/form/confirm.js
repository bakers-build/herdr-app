// ticket/form/confirm: the confirmations of frames 4 and R3-2, registered as dialog forms. Each
// says from and to, the consequence in the order it happens, and names the action and what
// stays; the write happens only after the primary button.
import * as actions from "../commands.js";
import { getStore, ready, refresh } from "../store.js";
import { CLOSING } from "../rules.js";

/** The ticket's branch and state, for the texts. @param {string} id */
async function facts(id) {
  try {
    await ready();
    const d = await getStore().ticket(id);
    return { branch: d?.ticket?.branch_name ?? null, state: d?.ticket?.state ?? null };
  } catch {
    return { branch: null, state: null };
  }
}

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

/** Change state (frame 4), also Approve plan... @param {{ ticket: string, from?: string, to: string }} p */
export async function stateForm(p) {
  const f = await facts(p.ticket);
  const from = p.from ?? f.state ?? "";
  return {
    kind: "dialog",
    title: `Move ${p.ticket} to ${p.to}?`,
    size: 16,
    pills: [from, p.to],
    text: consequence(p.ticket, from, p.to, f.branch),
    fields: [
      {
        name: "comment",
        type: "textarea",
        rows: 2,
        label: "Comment, optional, posted with the change",
      },
    ],
    hint: `Esc keeps it in ${from}`,
    keep: `Keep in ${from}`,
    submit: `Move to ${p.to}`,
    submitFirst: CLOSING.includes(p.to),
    steps: [
      {
        uses: ["comment"],
        when: (/** @type {any} */ v) => String(v.comment).trim(),
        run: (/** @type {any} */ v) => actions.comment(p.ticket, String(v.comment).trim()),
        done: "Comment posted",
        failed: "Not posted",
      },
      { run: () => actions.transition(p.ticket, p.to), failed: "not moved" },
    ],
    success: `${p.ticket} moved to ${p.to}`,
    after: refresh,
  };
}

/** @param {{ ticket: string }} p */
export const freezeForm = (p) => ({
  kind: "dialog",
  title: `Freeze ${p.ticket}?`,
  size: 15,
  text: "No conductor picks it up while it is frozen. A run that is already running continues until it ends.",
  fields: [],
  keep: "Keep",
  submit: "Freeze",
  submitFirst: true,
  keepSolid: true,
  steps: [{ run: () => actions.setFrozen(p.ticket, true), failed: "Not frozen" }],
  success: `${p.ticket} frozen`,
  after: refresh,
});

/** @param {{ ticket: string }} p */
export const unfreezeForm = (p) => ({
  kind: "dialog",
  title: `Unfreeze ${p.ticket}?`,
  size: 15,
  text: "A conductor can pick it up again. The label Question stays until you remove it.",
  fields: [],
  keep: "Keep frozen",
  submit: "Unfreeze",
  submitFirst: true,
  keepSolid: true,
  steps: [{ run: () => actions.setFrozen(p.ticket, false), failed: "Not unfrozen" }],
  success: `${p.ticket} unfrozen`,
  after: refresh,
});

/** Move to (R3-2): cancel the run, then set the conductor. @param {{ ticket: string, conductor: string, name: string }} p */
export async function moveForm(p) {
  const f = await facts(p.ticket);
  return {
    kind: "dialog",
    title: `Move ${p.ticket} to ${p.name}?`,
    size: 16,
    pills: ["its conductor", p.name],
    text: `First the running run is cancelled; its work stays in the worktree${f.branch ? ` on branch ${f.branch}` : ""}. Then a run starts on ${p.name}. The agent there begins from the branch, not from the old run's conversation.`,
    fields: [
      { name: "reason", type: "input", label: "Reason, optional, recorded on the cancelled run" },
    ],
    hint: "Esc keeps it on its conductor",
    keep: "Keep on its conductor",
    submit: `Cancel and run on ${p.name}`,
    join: ", ",
    steps: [
      {
        run: (/** @type {any} */ v) =>
          actions.cancelRun(p.ticket, String(v.reason).trim() || `Moved to ${p.name}`),
        done: "Run cancelled",
        failed: "Run not cancelled",
      },
      {
        run: () => actions.setConductor(p.ticket, p.conductor),
        failed: `not started on ${p.name}`,
      },
    ],
    success: `${p.ticket} runs on ${p.name}`,
    after: refresh,
  };
}

/** Cancel run (R3-2). @param {{ ticket: string }} p */
export const cancelForm = (p) => ({
  kind: "dialog",
  title: `Cancel the run of ${p.ticket}?`,
  size: 16,
  text: "The run stops now. Its work stays in the worktree on its branch; no new run starts until a conductor picks the ticket up again.",
  fields: [
    { name: "reason", type: "input", label: "Reason, optional, recorded on the cancelled run" },
  ],
  hint: "Esc keeps it running",
  keep: "Keep running",
  submit: "Cancel run",
  steps: [
    {
      run: (/** @type {any} */ v) =>
        actions.cancelRun(p.ticket, String(v.reason).trim() || "Cancelled from Herdr"),
      failed: "Not cancelled",
    },
  ],
  success: `Run of ${p.ticket} cancelled`,
  after: refresh,
});
