// shell/controller/sidebar: the modules' section of the left sidebar (R2-3), below Herdr's Spaces
// and Agents: one card per sidebar.section, its header the title and the sidebar.tool buttons, its
// body the section controller's rows.
import { h_flex, v_flex } from "gpui-base";
import { all, get } from "../../core/registry.js";
import { tokens, UI_FONT } from "../../ui/theme.js";
import { heading } from "../../ui/components/text.js";

/** @param {string} route @param {import("gpui-kit").AsyncContext} cx */
function make(route, cx) {
  const C = get("route", route);
  const c = new C({ view: route });
  return { c, ready: c.init?.({ view: route }, cx) };
}

export default class Sidebar {
  /** @type {{ title: string, c: any, tools: any[] }[]} one card per section, made once */
  sections = [];

  /** @param {import("gpui-shell").Props | undefined} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    const tools = all("sidebar.tool");
    /** @type {unknown[]} */
    const pending = [];
    this.sections = all("sidebar.section").map((s) => {
      const made = make(s.route, cx);
      pending.push(made.ready);
      return {
        title: s.title,
        c: made.c,
        tools: tools
          .filter((tool) => tool.section === s.id)
          .map((tool) => {
            const m = make(tool.route, cx);
            pending.push(m.ready);
            return m.c;
          }),
      };
    });
    cx.spawn(async (cx) => {
      await Promise.all(pending);
      cx.notify();
    });
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
      for (const tool of s.tools) header.child(tool.render(cx));
      const body = s.c.render(cx);
      root.child(
        v_flex()
          .p(8)
          .gap(2)
          .rounded(6)
          .border(1)
          .border_color(t.border)
          .bg(t.surface)
          .child(header)
          .children(Array.isArray(body) ? body : [body]),
      );
    }
    return root;
  }

  /** @param {import("gpui-kit").AsyncContext} cx */
  async close(cx) {
    for (const s of this.sections) {
      await s.c.close?.(cx);
      for (const tool of s.tools) await tool.close?.(cx);
    }
  }
}
