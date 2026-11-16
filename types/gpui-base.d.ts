// Minimal stand-in for the `gpui-base` module; replace with ~/.config/herdr-app/gpui-kit.d.ts
// from an installed Herdr (it declares gpui-kit and gpui-base together).
// Every name here is confirmed in herdrdev/herdr-app v0.1.15,
// vendor/gpui-kit/crates/shell/src/typings.rs (the source of the generated gpui-kit.d.ts),
// and used by Herdr's shipped mods (defaults/mods/*). Signatures are kept loose on purpose.
import type { Element } from "gpui-kit";

export function h_flex(): Element;
export function v_flex(): Element;

export interface ScrollHandle {
  scroll_to_item(index: number): void;
}
export const ScrollHandle: { new: () => ScrollHandle };

/** Payload emitted by retained text state. Submit events carry key modifiers. */
export interface InputEvent {
  readonly secondary?: boolean;
  readonly shift?: boolean;
}

/** Retained text state, created once (init or a handler, never render). */
export interface InputState {
  value(): string;
  set_value(next: string): void;
  on(
    event: "change" | "submit" | "focus" | "blur" | "paste_other",
    handler: (event: InputEvent, cx: any) => void,
  ): boolean;
  focus(): void;
  release(): boolean;
}
export const InputState: { new: (options?: { placeholder?: string; value?: string }) => InputState };
export const Input: { new: (state: InputState) => Element };

/** Retained multi-line text state. */
export interface TextareaState extends InputState {
  set_rows(rows: number): void;
  set_auto_grow(min_rows: number, max_rows: number): void;
  set_soft_wrap(wrap: boolean): void;
}
export const TextareaState: {
  new: (options?: { placeholder?: string; value?: string; rows?: number }) => TextareaState;
};
export const Textarea: { new: (state: TextareaState) => Element };

/** Rich HTML or Markdown text. */
export const TextView: {
  html(id: string, html: string): Element;
  markdown(id: string, markdown: string): Element;
};
