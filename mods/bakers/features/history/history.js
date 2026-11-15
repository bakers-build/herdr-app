// features/history: the panel's Activity (bakers_ticket_activity_list; the API chip when
// the CLI does not serve it) and Runs, collapsed until clicked.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme } from "herdr";
import { call } from "../../core/cli.js";
import { age, agentName, toMs } from "../../core/format.js";
import { chip, heading, icons } from "../../core/kit.js";

export class History {
  constructor() {
    this.activity = null;
    this.served = true;
    this.runsOpen = false;
  }

  /** @param {string} id */
  async load(id) {
    try {
      this.activity = (await call("bakers_ticket_activity_list", { ticket: id }))?.activity ?? [];
      this.served = true;
    } catch (/** @type {any} */ e) {
      this.activity = null;
      this.served = !e?.unknownTool;
    }
  }

  activitySection() {
    const t = theme();
    return v_flex()
      .id("activity")
      .gap(6)
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(heading("Activity"))
          .when(!this.served, (el) => el.child(chip())),
      )
      .children(
        (this.activity ?? []).map((/** @type {any} */ a) =>
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

  /** @param {any[]} runs */
  runsSection(runs) {
    const t = theme();
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
}
