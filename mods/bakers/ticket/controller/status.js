// ticket/controller/status: the status item of the ticket module: project, need-you count and
// last update (or "bakers offline"); a click opens the Tickets tab. The shell's status block
// draws it (status.item "ticket").
import { div } from "gpui-kit";
import { classify } from "../../core/errors.js";
import { currentProject } from "../../project/state.js";
import { tokens } from "../../ui/theme.js";
import { statusParts } from "../presenter/counts.js";
import { getStore, loadError } from "../store.js";
import { ensureTicketsTab } from "../tabs.js";

export default class TicketStatus {
  render() {
    const t = tokens();
    const store = getStore();
    const parts = statusParts({
      project: currentProject()?.name ?? null,
      count: store.needs().count,
      updated: store.updated,
      failure: classify(loadError()),
      now: Date.now(),
    });
    return parts.map((p) =>
      div()
        .truncate()
        .when(Boolean(p.tone), (el) => el.text_color(t[p.tone ?? "foreground"]))
        .when(Boolean(p.strong), (el) => el.font_semibold())
        .child(p.text),
    );
  }

  click() {
    ensureTicketsTab();
  }
}
