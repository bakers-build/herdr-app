// ticket/view/context: the right panel's ticket child (frame R2-3, 368 px, cmd-shift-T). It follows
// the focused ticket tab, else the selected list row, loads the ticket and its activity,
// maps them with presenter/context and draws Agent and conductor, Properties, Activity and
// Runs. Nothing here repeats the document; the panel never takes the focus.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, shared, window } from "herdr";
import { perform } from "../../core/actions.js";
import { openRoute } from "../../core/router.js";
import { classify } from "../../core/errors.js";
import { runReason, runTerminal, showAgent } from "../terminal.js";
import { focusedTicket } from "../tabs.js";
import { tokens, UI_FONT } from "../../ui/theme.js";
import { button } from "../../ui/components/button.js";
import { chip } from "../../ui/components/chip.js";
import { openForm } from "../../ui/form/dialog.js";
import { chevron, chevronRight } from "../../ui/components/icon.js";
import { openMenu } from "../../ui/components/menu.js";
import { failureView, loading } from "../../ui/components/state.js";
import { statusLine } from "../../ui/components/status-line.js";
import { heading, mono } from "../../ui/components/text.js";
import { getStore, ready } from "../store.js";
import { listActivity } from "../repository.js";
import { context } from "../presenter/context.js";

const CHECK_MS = 300;
const TYPES = ["feature", "bug", "chore", "deployment", "verification"];
const RECIPES = ["superpowers", "matt", "deploy-and-release", "verify"];

/** Opens a link with the system's opener (Herdr has no URL command). @param {string} url */
function openUrl(url) {
  const platform = window()?.platform;
  if (platform === "macos") exec("open", [url]);
  else if (platform === "windows") exec("cmd", ["/c", "start", "", url]);
  else exec("xdg-open", [url]);
}

export default class Panel {
  /** @type {string | null} what the last load was for: ticket and refresh time */
  key = null;
  /** @type {string | null} the followed ticket */
  id = null;
  /** @type {any} */
  detail = null;
  /** @type {import("../../core/errors.js").Failure | null} */
  failure = null;
  /** @type {any[] | null} */
  activity = null;
  activityServed = true;
  runsOpen = false;

  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    this.check(cx);
    cx.timer.every(CHECK_MS, (cx) => this.check(cx));
  }

  following() {
    return focusedTicket() ?? /** @type {string | null} */ (shared("bakers.selected")) ?? null;
  }

  /** Reloads when the followed ticket or the last refresh changed; no call otherwise. @param {import("gpui-kit").Context} cx */
  check(cx) {
    const id = this.following();
    const key = `${id}|${/** @type {any} */ (shared("bakers.needs"))?.updated ?? null}`;
    if (key === this.key) return;
    this.key = key;
    this.id = id;
    if (!id) {
      this.detail = null;
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      await this.load(id);
      cx.notify();
    });
  }

  /** @param {string} id */
  async load(id) {
    try {
      await ready();
      const detail = await getStore().ticket(id);
      if (this.id !== id) return;
      this.detail = detail;
      this.failure = null;
      try {
        this.activity = await listActivity(detail.ticket.id);
        this.activityServed = true;
      } catch (e) {
        this.activity = null;
        this.activityServed = classify(e)?.kind !== "api";
      }
    } catch (e) {
      this.failure = classify(e);
    }
  }

  /** @param {any} vm */
  agentSection(vm) {
    const t = tokens();
    const small = { h: 24, size: 11 };
    const term = runTerminal(vm.id, this.detail.ticket.id);
    return v_flex()
      .id("agent-section")
      .gap(6)
      .child(heading("Agent and conductor"))
      .child(
        statusLine(null, {
          tone: vm.agent.tone,
          ring: vm.agent.ring,
          text: vm.agent.text,
          rest: vm.agent.rest,
          colored: true,
        }),
      )
      .child(
        h_flex()
          .gap(6)
          .flex_wrap()
          .child(
            button(
              "show-agent",
              "Show agent",
              term ? () => showAgent(vm.id) : null,
              vm.agent.show ? { ...small, disabled: true, reason: vm.agent.show } : small,
            ),
          )
          .child(
            button(
              "move-to",
              "Move to...",
              () => openRoute("ticket.conductor-picker", { ticket: vm.id }),
              small,
            ),
          )
          .child(
            button(
              "cancel-run",
              "Cancel run...",
              vm.agent.cancel ? null : () => openForm("cancel", { ticket: vm.id }),
              vm.agent.cancel ? { ...small, disabled: true, reason: vm.agent.cancel } : small,
            ),
          ),
      )
      .child(div().text_size(11).text_color(t.muted).child(vm.agent.hint));
  }

  /** @param {any} vm */
  properties(vm) {
    const t = tokens();
    const p = vm.properties;
    const label = (/** @type {string} */ text) =>
      div().text_size(11).text_color(t.muted).child(text);
    const cell = (/** @type {any} */ name, /** @type {any} */ value, span = false) =>
      v_flex()
        .when(span, (el) => el.w_full())
        .when(!span, (el) => el.w(160))
        .child(name)
        .child(value);
    const pick =
      (
        /** @type {string} */ field,
        /** @type {string[]} */ values,
        /** @type {string} */ current,
      ) =>
      () =>
        openMenu(
          values.map((v) => ({
            label: v,
            current: current === v,
            action: ["ticket.classify", vm.id, { [field]: v }],
          })),
        );
    const labels = h_flex()
      .gap(4)
      .mt(2)
      .flex_wrap()
      .children(
        p.labels.map((/** @type {string} */ name) =>
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
                    await perform(["ticket.labels", vm.id, { labels_remove: [name] }]);
                    await this.load(vm.id);
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
          .on_click(() => openRoute("ticket.label-picker", { ticket: vm.id }))
          .child("+"),
      );
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
            .on_click(pick("type", TYPES, p.type))
            .child(p.type),
        ),
      )
      .child(
        cell(
          label("Recipe"),
          div()
            .id("prop-recipe")
            .cursor_pointer()
            .on_click(pick("recipe", RECIPES, p.recipe))
            .child(p.recipe),
        ),
      )
      .child(cell(label("Labels"), labels, true))
      .child(
        cell(
          label("Frozen"),
          h_flex()
            .gap(4)
            .items_center()
            .child(p.frozen.text)
            .child(
              button(
                p.frozen.form,
                p.frozen.label,
                () => openForm(p.frozen.form, { ticket: vm.id }),
                { h: 20, px: 6, size: 11 },
              ).rounded(4),
            ),
        ),
      )
      .child(
        cell(
          label("Assignee"),
          div()
            .when(p.assignee === "-", (el) => el.text_color(t.muted))
            .child(p.assignee),
        ),
      )
      .child(
        cell(
          label("Reviewers"),
          div()
            .when(p.reviewers === "-", (el) => el.text_color(t.muted))
            .child(p.reviewers),
        ),
      )
      .child(cell(label("Branch"), mono(p.branch, 11), true))
      .child(
        cell(
          label("Parent"),
          p.parent ? div().child(p.parent) : div().text_color(t.muted).child("-"),
        ),
      )
      .child(
        cell(
          label("Links"),
          p.link
            ? div()
                .id("link-0")
                .text_color(t.accent)
                .cursor_pointer()
                .on_click(() => openUrl(p.link.uri))
                .child(p.link.title)
            : div().text_color(t.muted).child("-"),
        ),
      );
  }

  /** @param {any} vm */
  history(vm) {
    const t = tokens();
    const activity = v_flex()
      .id("activity")
      .gap(6)
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(heading("Activity"))
          .when(vm.activity.api, (el) => el.child(chip())),
      )
      .children(
        vm.activity.items.map((/** @type {any} */ a) =>
          h_flex()
            .gap(8)
            .child(div().flex_1().child(a.text))
            .child(div().text_color(t.muted).child(a.age)),
        ),
      );
    const runs = v_flex()
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
          .child(this.runsOpen ? chevron(12) : chevronRight(12))
          .child(`Runs ${vm.runs.length}`),
      )
      .when(this.runsOpen, (el) =>
        el.children(
          vm.runs.map((/** @type {any} */ r) =>
            h_flex()
              .gap(8)
              .child(div().w(70).child(r.state))
              .child(div().flex_1().text_color(t.muted).child(r.agent))
              .child(div().text_color(t.muted).child(r.age)),
          ),
        ),
      );
    return [activity, runs];
  }

  render() {
    const t = tokens();
    const root = v_flex()
      .id("ticket-panel")
      .size_full()
      .min_h(0)
      .bg(t.surface)
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground);
    if (!this.id) return root.child(loading("No ticket selected"));
    if (!this.detail || this.detail.ticket?.identifier !== this.id)
      return root.child(
        this.failure ? failureView(this.failure, null) : loading(`Loading ${this.id}...`),
      );
    const terminal = runTerminal(this.id, this.detail.ticket.id);
    const vm = context(this.detail, {
      terminal,
      reason: runReason(
        { runs: this.detail.runs, claim_machine: this.detail.ticket.claim_machine },
        terminal,
      ),
      now: Date.now(),
      activity: this.activity,
      activityServed: this.activityServed,
    });
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
          .child(mono(vm.id, 12).font_semibold())
          .child(div().text_size(12).text_color(t.muted).child(vm.sub)),
      )
      .child(
        v_flex()
          .id("panel-body")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .p(12)
          .gap(14)
          .child(this.agentSection(vm))
          .child(this.properties(vm))
          .children(this.history(vm)),
      );
  }
}
