// ui/keyboard: the late keyboard claim of popups, dialogs and the palette. An overlay's claims in
// init and on its first layout can both come before it holds the keyboard (the first one after a
// Herdr start or after R), and Esc then goes elsewhere. Herdr's picker claims once more after
// 600 ms; the mod's overlays do the same.

/** When an overlay takes the keyboard again after opening, as Herdr's picker does. */
export const REFOCUS_MS = 600;

/** Calls `take` once, REFOCUS_MS after now; `take` decides whether the claim still applies.
 *  @param {{ timer: { after(ms: number, fn: () => void, opts?: any): unknown } }} cx
 *  @param {() => void} take @param {{ owner?: any }} [opts] the timer's owner (TaskOptions) */
export function claimLater(cx, take, opts) {
  cx.timer.after(REFOCUS_MS, () => take(), opts);
}
