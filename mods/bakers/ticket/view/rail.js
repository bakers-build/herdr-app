// ticket/view/rail: the bakers button with the needs-you count; it opens the Tickets tab on
// Needs me. The shell's rail draws it (rail.item "ticket").
import { shared } from "herdr";
import { square } from "../../ui/components/square.js";
import { tokens } from "../../ui/theme.js";
import { railLabel } from "../presenter/counts.js";
import { setView } from "../state.js";
import { ensureTicketsTab } from "../tabs.js";

export default class TicketRail {
  render() {
    const t = tokens();
    const label = railLabel(/** @type {any} */ (shared("bakers.needs"))?.count ?? 0);
    return square()
      .id("rail-bakers")
      .border_color(t.accent)
      .text_size(10)
      .font_semibold()
      .text_color(t[label.tone])
      .accessibility_label(label.aria)
      .on_click(() => {
        setView("needs-me");
        ensureTicketsTab();
      })
      .child(label.text);
  }
}
