// ticket/state: shared UI state of the ticket screens: the chosen list and Show closed.
// Shared between mod copies, so it holds names and flags only, no ticket content.
import { setShared, shared } from "herdr";

/** The Tickets tab's view (shared, so the sidebar and the view menu agree). */
export const currentView = () => /** @type {string} */ (shared("bakers.view")) ?? "needs-me";
/** @param {string} view */
export const setView = (view) => setShared("bakers.view", view);
export const showClosed = () => Boolean(shared("bakers.showClosed"));
