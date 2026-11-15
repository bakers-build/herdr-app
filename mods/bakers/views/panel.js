// The right panel's ticket child (frame R2-3, 368 px, cmd-shift-T): the context of the
// focused ticket tab, else of the selected list row. Agent and conductor, Properties
// (Type, Recipe and Labels save at once), Activity and Runs (collapsed). Nothing here
// repeats the document. It never takes the focus.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, run, shared, theme, window } from "herdr";
import { machineOf, NO_TERMINAL, runTerminal } from "../lib/agent.js";
import { api, getStore, ready } from "../lib/context.js";
import { age, agentName, toMs } from "../lib/format.js";
import { openConfirm, openMenu, openPicker } from "../lib/overlay.js";
import { focusedTicket } from "../lib/tabs.js";
import { button, chip, dot, heading, icons, mono, UI_FONT } from "../lib/theme.js";

export const TYPES = ["feature", "bug", "chore", "deployment", "verification"];
export const RECIPES = ["superpowers", "matt", "deploy-and-release", "verify"];
const CHECK_MS = 300;

/** Opens a link with the system's opener (Herdr has no URL command). @param {string} url */
function openUrl(url) {
  const platform = window()?.platform;
  if (platform === "macos") exec("open", [url]);
  else if (platform === "windows") exec("cmd", ["/c", "start", "", url]);
  else exec("xdg-open", [url]);
}

export default class Panel {
  init(_props, cx) {
    this.key = null;
    this.id = null;
    this.detail = null;
    this.activity = null;
    this.activityServed = true;
    this.runsOpen = false;
    this.error = null;
    this.check(cx);
    cx.timer.every(CHECK_MS, (cx) => this.check(cx));
  }

  following() {
    return focusedTicket() ?? /** @type {string | null} */ (shared("bakers.selected")) ?? null;
  }

  /** Reloads when the followed ticket or the last refresh changed. @param {any} cx */
  check(cx) {
    const id = this.following();
    const updated = /** @type {any} */ (shared("bakers.needs"))?.updated ?? null;
    const key = `${id}|${updated}`;
    if (key === this.key) return;
    this.key = key;
    this.id = id;
    if (!id) {
      this.detail = null;
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      try {
        await ready();
        const detail = await getStore().ticket(id);
        if (this.id !== id) return;
        this.detail = detail;
        this.error = null;
        try {
          this.activity = await api.listActivity(id);
          this.activityServed = true;
        } catch (/** @type {any} */ e) {
          this.activity = null;
          this.activityServed = !e?.unknownTool;
        }
      } catch (/** @type {any} */ e) {
        this.error = e?.message ?? String(e);
      }
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const root = v_flex()
      .id("ticket-panel")
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground);
    if (!this.id) return root.child(div().p(12).text_color(t.muted).child("No ticket selected"));
    if (!this.detail || this.detail.ticket?.identifier !== this.id)
      return root.child(
        div()
          .p(12)
          .text_color(this.error ? t.blocked : t.muted)
          .child(this.error ?? `Loading ${this.id}...`),
      );
    const d = this.detail;
    const tk = d.ticket;
    return root
      .child(
        h_flex()
          .id("panel-header")
          .flex_none()
          .h(40)
          .px(12)
          .gap(8)
          .items_center()
          .bg(t.canvas)
          .border_b(1)
          .border_color(t.border)
          .child(mono(tk.identifier, 12).font_semibold())
          .child(
            div()
              .text_size(12)
              .text_color(t.muted)
              .child(tk.frozen ? `${tk.state}, frozen` : tk.state),
          ),
      )
      .child(
        v_flex()
          .id("panel-body")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .p(12)
          .gap(14)
          .child(this.agentSection(t))
          .child(this.properties(t))
          .child(this.activitySection(t))
          .child(this.runsSection(t)),
      );
  }

  agentSection(t) {
    const d = this.detail;
    const term = runTerminal(this.id, d.ticket.id);
    const where = machineOf(term);
    const active = d.runs.find((r) => !r.closed);
    const since = d.why === "Asked a question" ? d.since : toMs(active?.started_at);
    const rest = [where ? `on ${where}` : null, since != null ? age(Date.now() - since) : null]
      .filter(Boolean)
      .join(", ");
    const tone = d.agent.tone;
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
              !d.agent.run,
            ),
          )
          .child(div().child(d.agent.text))
          .when(Boolean(rest), (el) => el.child(div().text_color(t.muted).child(rest))),
      )
      .child(
        h_flex()
          .gap(6)
          .flex_wrap()
          .child(
            button(
              "show-agent",
              "Show agent",
              term ? () => run("agent.focus", { terminal: term.address }) : null,
              term ? small : { ...small, disabled: true, reason: NO_TERMINAL },
            ),
          )
          .child(
            button(
              "move-to",
              "Move to...",
              () => openPicker("conductor", { ticket: this.id }),
              small,
            ),
          )
          .child(
            button(
              "cancel-run",
              "Cancel run...",
              active ? () => openConfirm("cancel", { ticket: this.id }) : null,
              active ? small : { ...small, disabled: true, reason: "No run is active" },
            ),
          ),
      )
      .child(div().text_size(11).text_color(t.muted).child("R moves, G shows the agent."));
  }

  properties(t) {
    const tk = this.detail.ticket;
    const label = (/** @type {string} */ text) =>
      div().text_size(11).text_color(t.muted).child(text);
    const cell = (/** @type {any} */ name, /** @type {any} */ value, span = false) =>
      v_flex()
        .when(span, (el) => el.w_full())
        .when(!span, (el) => el.w(160))
        .child(name)
        .child(value);
    const pickMenu = (/** @type {string} */ field, /** @type {string[]} */ values) => () =>
      openMenu(
        values.map((v) => ({
          label: v,
          current: tk[field] === v,
          action: ["classify", tk.identifier, { [field]: v }],
        })),
      );
    const labels = h_flex()
      .gap(4)
      .mt(2)
      .flex_wrap()
      .children(
        (tk.labels ?? []).map((/** @type {string} */ name) =>
          h_flex()
            .h(20)
            .px(8)
            .gap(4)
            .items_center()
            .rounded(10)
            .border(1)
            .border_color(t.border)
            .bg(t.raised)
            .text_size(11)
            .child(name)
            .child(
              div()
                .id(`label-x-${name}`)
                .text_color(t.muted)
                .cursor_pointer()
                .on_click((_e, cx) =>
                  cx.spawn(async (cx) => {
                    await api.updateTicket(tk.identifier, { labels_remove: [name] });
                    await this.reload();
                    cx.notify();
                  }),
                )
                .child("×"),
            ),
        ),
      )
      .child(
        h_flex()
          .id("label-add")
          .h(20)
          .px(8)
          .items_center()
          .rounded(10)
          .border(1)
          .border_dashed()
          .border_color(t.muted)
          .bg(t.surface)
          .text_size(11)
          .text_color(t.muted)
          .cursor_pointer()
          .on_click(() => openPicker("labels", { ticket: tk.identifier }))
          .child("+"),
      );
    const frozenSince = toMs(tk.frozen_at);
    const frozen = h_flex()
      .gap(4)
      .items_center()
      .child(tk.frozen ? `Yes${frozenSince ? `, ${age(Date.now() - frozenSince)}` : ""}` : "No")
      .child(
        button(
          tk.frozen ? "unfreeze" : "freeze",
          tk.frozen ? "Unfreeze..." : "Freeze...",
          () => openConfirm(tk.frozen ? "unfreeze" : "freeze", { ticket: tk.identifier }),
          { h: 20, px: 6, size: 11 },
        ).rounded(4),
      );
    const apiLabel = (/** @type {string} */ text) =>
      h_flex().gap(4).items_center().text_size(11).text_color(t.muted).child(text).child(chip());
    const link = (tk.links ?? [])[0];
    return h_flex()
      .id("properties")
      .flex_wrap()
      .gap(12)
      .child(div().w_full().child(heading("Properties")))
      .child(
        cell(
          label("Type"),
          div()
            .id("prop-type")
            .cursor_pointer()
            .on_click(pickMenu("type", TYPES))
            .child(tk.type ?? "-"),
        ),
      )
      .child(
        cell(
          label("Recipe"),
          div()
            .id("prop-recipe")
            .cursor_pointer()
            .on_click(pickMenu("recipe", RECIPES))
            .child(tk.recipe ?? "-"),
        ),
      )
      .child(cell(label("Labels"), labels, true))
      .child(cell(label("Frozen"), frozen))
      .child(cell(apiLabel("Assignee"), div().text_color(t.muted).child("-")))
      .child(cell(apiLabel("Reviewers"), div().text_color(t.muted).child("-")))
      .child(cell(label("Branch"), mono(tk.branch_name ?? "-", 11), true))
      .child(
        cell(
          label("Parent"),
          tk.parent ? div().child(String(tk.parent)) : div().text_color(t.muted).child("-"),
        ),
      )
      .child(
        cell(
          label("Links"),
          link
            ? div()
                .id("link-0")
                .text_color(t.accent)
                .cursor_pointer()
                .on_click(() => openUrl(link.uri))
                .child(link.title ?? link.uri)
            : div().text_color(t.muted).child("-"),
        ),
      );
  }

  activitySection(t) {
    const items = this.activity ?? [];
    return v_flex()
      .id("activity")
      .gap(6)
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(heading("Activity"))
          .when(!this.activityServed, (el) => el.child(chip())),
      )
      .children(
        items.map((/** @type {any} */ a) =>
          h_flex()
            .gap(8)
            .child(
              div()
                .flex_1()
                .child(a.text ?? a.summary ?? ""),
            )
            .child(
              div()
                .text_color(t.muted)
                .child(age(Date.now() - (toMs(a.at ?? a.created) ?? Date.now()))),
            ),
        ),
      );
  }

  runsSection(t) {
    const runs = this.detail.runs ?? [];
    return v_flex()
      .id("runs")
      .gap(6)
      .child(
        h_flex()
          .id("runs-toggle")
          .gap(6)
          .py(6)
          .items_center()
          .border_t(1)
          .border_color(t.border)
          .text_color(t.muted)
          .cursor_pointer()
          .on_click((_e, cx) => {
            this.runsOpen = !this.runsOpen;
            cx.notify();
          })
          .child(svg(this.runsOpen ? icons.down : icons.right).size(12))
          .child(`Runs ${runs.length}`),
      )
      .when(this.runsOpen, (el) =>
        el.children(
          runs.map((/** @type {any} */ r) =>
            h_flex()
              .gap(8)
              .child(div().w(70).child(r.state))
              .child(div().flex_1().text_color(t.muted).child(agentName(r.agent)))
              .child(
                div()
                  .text_color(t.muted)
                  .child(age(Date.now() - (toMs(r.started_at) ?? Date.now()))),
              ),
          ),
        ),
      );
  }

  async reload() {
    if (this.id) this.detail = await getStore().ticket(this.id);
  }
}
