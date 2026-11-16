// Fixture for tests/harness.test.ts: a view that sends one Herdr command on click.
import { div, View } from "gpui-kit";
import { run } from "herdr";

export default class Click extends View {
  render() {
    return div()
      .id("go")
      .on_click(() => run("tab.select", { index: 1 }))
      .child("Go");
  }
}
