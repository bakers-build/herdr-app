// project/repository: reading projects through JSON:API (bb_project).
import { read, search } from "../core/api.js";

export const listProjects = () =>
  search("bb_project", "bb_project", { sort: "name", limit: 50, all: true });
/** @param {string} uuid */
export const readProject = (uuid) => read("bb_project", "bb_project", uuid);
