// Minimal stand-in; replace with ~/.config/herdr-app/gpui-kit.d.ts from an installed Herdr.
// Herdr generates the real file at runtime from its component and style registries, so it
// cannot be vendored. This shim declares only what the mods here and herdr.d.ts use.

export type HostValue = unknown;

export interface Element {
  child(c: Element | string): Element;
  // biome-ignore lint/suspicious/noExplicitAny: stand-in for the generated builder surface
  [k: string]: any;
}

export function div(): Element;

export class View {
  // biome-ignore lint/suspicious/noExplicitAny: render signature varies by mod
  render(...args: any[]): Element;
}
