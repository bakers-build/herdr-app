// shell/controller/sidebar: the modules' section of the left sidebar (R2-3), below Herdr's Spaces
// and Agents: one card per sidebar.section, its header the title and the sidebar.tool buttons, its
// body the section controller's rows.
import { h_flex, v_flex } from "gpui-base";
import { all } from "../../core/registry.js";
import { draw, launch, settle, stop } from "./contributions.js";
import { tokens, UI_FONT } from "../../ui/theme.js";
import { heading } from "../../ui/components/text.js";

export default class Sidebar {
  /** @type {{ title: string, c: any, tools: any[] }[]} one card per section, made once */
  sections = [];

  /** @param {import("gpui-shell").Props | undefined} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    const tools = all("sidebar.tool");
    /** @type {{ ready: unknown }[]} */
    const pending = [];
    this.sections = all("sidebar.section").map((s) => {
      const made = launch(s.route, cx);
      pending.push(made);
      return {
        title: s.title,
        c: made.c,
        tools: tools
          .filter((tool) => tool.section === s.id)
          .map((tool) => {
            const m = launch(tool.route, cx);
            pending.push(m);
            return m.c;
          }),
      };
    });
    settle(pending, cx);
  }

  /** @param {import("gpui-kit").Context} cx */
  render(cx) {
    const t = tokens();
    const root = v_flex()
      .id("bakers-sidebar")
      .w(220)
      .px(10)
      .py(12)
      .font_family(UI_FONT)
      .text_size(12)
      .text_color(t.foreground);
    for (const s of this.sections) {
      const header = h_flex().gap(6).mb(4).items_center().child(heading(s.title));
      for (const tool of s.tools) header.children(draw(tool, cx));
      root.child(
        v_flex()
          .p(8)
          .gap(2)
          .rounded(6)
          .border(1)
          .border_color(t.border)
          .bg(t.surface)
          .child(header)
          .children(draw(s.c, cx)),
      );
    }
    return root;
  }

  /** @param {import("gpui-kit").AsyncContext} cx */
  async close(cx) {
    for (const s of this.sections) await stop([s.c, ...s.tools], cx);
  }
}
