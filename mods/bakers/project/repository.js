// project/repository: reading projects through JSON:API (bb_project).
import { read, search } from "../core/api.js";

const INCLUDE = ["group_id", "group_id.workspace_id"];

export const listProjects = () =>
  search("bb_project", "bb_project", { sort: "name", include: INCLUDE, limit: 50, all: true });
/** @param {string} uuid */
export const readProject = (uuid) => read("bb_project", "bb_project", uuid, INCLUDE);
