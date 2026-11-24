# Herdr reference used by the bakers mods

All facts below come from [herdrdev/herdr-app](https://github.com/herdrdev/herdr-app) at tag
`v0.1.15` (commit `9950887`), read only. The mods follow what these files say; where a fact
decided a design choice, the choice is named.

| File in `v0.1.15` | Used for |
|---|---|
| `defaults/AGENTS.md` | Layout tree format (`block`, `row`, `column`, `stack`, `size.px`, `hidden`), keys (`global`, `<mod>.<command>` to `nextCommand()`), commands (`tab.new {name, mod, props}`, `tab.close`, `tab.rename`, `tab.move`, `tab.select`, `layout.toggle/show/hide/select`, `agent.focus {terminal}`), overlays (`openOverlay`, `closeOverlay`, `kind: dialog/popup`, `modal`), `notify({title, body, level, action})`, `exec`, `readTextFile`, `shared`/`setShared`, `cx.timer`, `cx.spawn`, key events (`e.key`, `e.keystroke`, `e.modifiers.platform`) |
| `defaults/herdr.d.ts` | Vendored as `types/herdr.d.ts`. `TabInfo` has no props and `run()` returns `null`, so keyed tabs (the Tickets tab, leftover ticket tabs) are found by their name and a new tab's id is learned when it appears in `spaces()` |
| `defaults/layouts/main.json` | The tree the installer transforms (`sidebar`, `sidebar-lists` with `spaces` and `agents`, `tabs` 42 px, `work-body` with `main` and `panel` 368 px holding the `panel-body` stack, `status` 28 px). Copied as `tests/fixtures/herdr-main.json` |
| `defaults/keys.macos.json` | `cmd-b` is already `layout.toggle:sidebar`; `cmd-shift-t`, `cmd-shift-o`, `cmd-shift-n` are free on macOS |
| `defaults/mods/tabs/main.js` | Origin of `mods/bakers/ui/layout/tabs-bar.js` (tab items, panel buttons, window buttons) |
| `defaults/mods/toast/main.js` | The toast runs `action.name` with `action.args` on click and closes; it never takes focus |
| `defaults/mods/confirm/main.js` | Dialog pattern: focus handle, Enter and Esc in `on_key_down`, `closeOverlay(props().overlay)` |
| `defaults/mods/picker/main.js`, `menu/main.js` | Popup list pattern: up, down, enter, escape; `InputState` with `change` and `submit` |
| `defaults/mods/win98/` | The pattern for one mod with many roles: `main.js` routes `props().role`, `kit.js` is the shared kernel, one file per role; the bakers mod follows it with `props().view` and splits the code into layers (docs/architecture.md) |
| `defaults/mods/workspace-status/main.js` | The status bar block the bakers status item sits beside |
| `scripts/picker.test.ts` | The test pattern: real mod source over stubbed globals, recorded element calls |
| `vendor/gpui-kit/crates/shell/src/typings.rs` | Source of the generated `gpui-kit.d.ts`: `InputState`, `TextareaState`, `Textarea`, `TextView.markdown`, `KeyEvent` (`keystroke` spells the platform key `cmd` everywhere), `ClickEvent.click_count`. Vendored from an installed Herdr as `types/gpui-kit.d.ts` (see `docs/conventions.md`) |
