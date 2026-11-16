// presenter/search: a result in Go to ticket: identifier, title and state.
import { isClosed } from "../rules.js";

/** @param {any} r a bakers_ticket_search result */
export const search = (r) => ({
  id: r.identifier,
  title: r.title ?? "",
  state: r.state ?? "",
  closed: isClosed(r),
});
