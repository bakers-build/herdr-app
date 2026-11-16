// ticket/presenter/tab: a ticket's tab name, "<ID> <state>", or "<ID> closed" after done or
// cancelled, so the name follows the state.
import { isClosed } from "../rules.js";

/** @param {{ id: string, state: string, closed?: boolean }} t */
export const tabName = (t) => (isClosed(t) ? `${t.id} closed` : `${t.id} ${t.state}`);
