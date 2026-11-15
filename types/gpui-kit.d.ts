// Minimal stand-in; replace with ~/.config/herdr-app/gpui-kit.d.ts from an installed Herdr.
// Herdr generates the real file at runtime from its component and style registries, so it
// cannot be vendored. This shim declares only what the mods here and herdr.d.ts use.

export type HostValue = unknown;

export interface Element {
  child(c: Element | string): Element;
  [k: string]: any;
}

export function div(): Element;
/** Confirmed in herdr-app v0.1.15 vendor/gpui-kit/crates/shell/src/typings.rs. */
export function svg(path: string): Element;
/** Confirmed in herdr-app v0.1.15 vendor/gpui-kit/crates/shell/src/typings.rs. */
export function image(path: string): Element;

export class View {
  render(...args: any[]): Element;
}
