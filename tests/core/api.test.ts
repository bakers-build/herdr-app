import { beforeEach, expect, test } from "bun:test";
import { env, fetched, reset } from "../harness";
import { jsonapiServer } from "../fixtures/jsonapi-server";

const api: any = await import("../../mods/bakers/core/api.js");

const TOKEN = {
  base_url: "https://bakers.test",
  token: "abc",
  token_type: "Bearer",
  expires_at: "2099-01-01T00:00:00Z",
};
const doc = (data: any) => ({ jsonapi: { version: "1.1" }, data });

function cliWithToken(tokens: any[] = [TOKEN]) {
  let n = 0;
  env.exec = async (_c, argv) => {
    if (argv[0] === "auth" && argv[1] === "token")
      return {
        code: 0,
        stdout: JSON.stringify(tokens[Math.min(n++, tokens.length - 1)]),
        stderr: "",
      };
    return { code: 1, stdout: "", stderr: "unexpected" };
  };
}

beforeEach(() => {
  reset();
  api._resetForTests();
});

test("read asks the CLI for a token once and fetches JSON:API with it", async () => {
  cliWithToken();
  const seen: any[] = [];
  env.fetch = async (_url, opts) => {
    seen.push(opts.headers);
    return {
      status: 200,
      ok: true,
      json: async () =>
        doc({ type: "bb_ticket--bb_ticket", id: "u1", attributes: { identifier: "SHOP-41" } }),
      text: async () => "",
    };
  };
  const t = await api.read("bb_ticket", "bb_ticket", "u1", ["runs", "labels"]);
  await api.read("bb_ticket", "bb_ticket", "u1");
  expect(t).toMatchObject({ id: "u1", identifier: "SHOP-41" });
  expect(fetched()).toEqual([
    "https://bakers.test/jsonapi/bb_ticket/bb_ticket/u1?include=runs,labels",
    "https://bakers.test/jsonapi/bb_ticket/bb_ticket/u1",
  ]);
  expect(seen[0]).toEqual({ Authorization: "Bearer abc", Accept: "application/vnd.api+json" });
  expect(env.calls.filter((c) => c.fn === "exec").length).toBe(1);
});

test("search sends filters as JSON:API conditions, sort, include and paging; it follows next pages", async () => {
  cliWithToken();
  env.fetch = async (url) => {
    const offset = Number(new URL(url).searchParams.get("page[offset]") ?? 0);
    const body = {
      ...doc([{ type: "x", id: `r${offset}` }]),
      links: offset === 0 ? { next: { href: "n" } } : {},
    };
    return { status: 200, ok: true, json: async () => body, text: async () => "" };
  };
  const rows = await api.search("bb_ticket", "bb_ticket", {
    filter: [
      ["project_id.id", "=", "p1"],
      ["title", "CONTAINS", "cart"],
      ["closed_date", "IS NOT NULL"],
    ],
    sort: "-changed",
    include: ["runs"],
    limit: 50,
    all: true,
  });
  expect(rows.map((r: any) => r.id)).toEqual(["r0", "r50"]);
  const first = fetched()[0];
  expect(first).toContain("/jsonapi/bb_ticket/bb_ticket?");
  expect(first).toContain(
    "filter[f0][condition][path]=project_id.id&filter[f0][condition][operator]==&filter[f0][condition][value]=p1",
  );
  expect(first).toContain(
    "filter[f1][condition][operator]=CONTAINS&filter[f1][condition][value]=cart",
  );
  expect(first).toContain("filter[f2][condition][operator]=IS NOT NULL");
  expect(first).not.toContain("filter[f2][condition][value]");
  expect(first).toContain("sort=-changed&include=runs&page[limit]=50&page[offset]=0");
  expect(fetched()[1]).toContain("page[offset]=50");
});

test("search sends a boolean as 1 or 0 and an IN value as a list", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => doc([]),
    text: async () => "",
  });
  await api.search("bb_ticket", "bb_ticket", {
    filter: [
      ["closed", "=", false],
      ["frozen", "=", true],
      ["identifier", "IN", ["SHOP-41", "SHOP-49"]],
    ],
  });
  const url = fetched()[0];
  expect(url).toContain(
    "filter[f0][condition][path]=closed&filter[f0][condition][operator]==&filter[f0][condition][value]=0",
  );
  expect(url).toContain("filter[f1][condition][value]=1");
  expect(url).toContain(
    "filter[f2][condition][operator]=IN&filter[f2][condition][value][]=SHOP-41&filter[f2][condition][value][]=SHOP-49",
  );
});

test("parallel reads ask the CLI for one token", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => doc({ type: "x", id: "1" }),
    text: async () => "",
  });
  await Promise.all([api.read("x", "x", "1"), api.read("x", "x", "1"), api.read("x", "x", "1")]);
  expect(env.calls.filter((c) => c.fn === "exec").length).toBe(1);
});

test("a 401 asks the CLI for a new token and tries once more", async () => {
  cliWithToken([TOKEN, { ...TOKEN, token: "fresh" }]);
  const auth: string[] = [];
  env.fetch = async (_u, opts) => {
    auth.push(opts.headers.Authorization);
    const ok = opts.headers.Authorization === "Bearer fresh";
    return {
      status: ok ? 200 : 401,
      ok,
      json: async () => doc({ type: "x", id: "1" }),
      text: async () => "unauthorized",
    };
  };
  expect((await api.read("x", "x", "1")).id).toBe("1");
  expect(auth).toEqual(["Bearer abc", "Bearer fresh"]);
});

test("an HTTP error becomes a BakersError with the server's JSON:API message", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 403,
    ok: false,
    json: async () => ({ errors: [{ title: "Forbidden", detail: "No access to project p9." }] }),
    text: async () => "",
  });
  const e: any = await api.read("bb_project", "bb_project", "p9").catch((x: any) => x);
  expect(e.message).toBe("No access to project p9.");
  expect(e.code).toBe(403);
});

test("a network failure is offline", async () => {
  cliWithToken();
  const e: any = await api.read("x", "x", "1").catch((x: any) => x);
  expect(e.offline).toBe(true);
});

test("no signed-in CLI: the CLI's message, offline when the CLI is missing", async () => {
  env.exec = async () => ({
    code: 1,
    stdout: "",
    stderr: JSON.stringify({
      error: { code: "E_AUTH", message: "Not signed in; run bakers auth login" },
    }),
  });
  const e: any = await api.read("x", "x", "1").catch((x: any) => x);
  expect(e.message).toBe("Not signed in; run bakers auth login");
  api._resetForTests();
  env.exec = async () => ({ code: 127, stdout: "", stderr: "not found" });
  expect((await api.read("x", "x", "1").catch((x: any) => x)).offline).toBe(true);
});

test("an older CLI without auth token reads through bakers dropsh instead", async () => {
  env.exec = async (_c, argv) => {
    if (argv[0] === "auth")
      return { code: 1, stdout: "", stderr: "error: unknown command 'token'" };
    return {
      code: 0,
      stdout: JSON.stringify(
        doc([{ type: "bb_ticket--bb_ticket", id: "u1", attributes: { title: "A" } }]),
      ),
      stderr: "",
    };
  };
  const rows = await api.search("bb_ticket", "bb_ticket", {
    filter: [
      ["project_id.id", "=", "p1"],
      ["closed_date", "IS NOT NULL"],
    ],
    include: ["runs", "labels"],
    sort: "-changed",
    limit: 20,
  });
  expect(rows[0]).toMatchObject({ id: "u1", title: "A" });
  const argv = env.calls.filter((c) => c.fn === "exec").map((c) => c.args[1])[1];
  expect(argv).toEqual([
    "dropsh",
    "search",
    "bb_ticket",
    "--bundle",
    "bb_ticket",
    "--filter",
    "project_id.id:p1",
    "--filter",
    "closed_date:IS NOT NULL",
    "--sort",
    "-changed",
    "--include",
    "runs",
    "labels",
    "--limit",
    "20",
    "--offset",
    "0",
  ]);
  expect(fetched()).toEqual([]);
});

test("after falling back to dropsh, later reads ask the CLI for a token no more", async () => {
  env.exec = async (_c, argv) => {
    if (argv[0] === "auth")
      return { code: 1, stdout: "", stderr: "error: unknown command 'token'" };
    return { code: 0, stdout: JSON.stringify(doc({ type: "x", id: "1" })), stderr: "" };
  };
  await api.read("x", "x", "1");
  await api.read("x", "x", "1");
  const auth = env.calls.filter((c) => c.fn === "exec" && (c.args as any[])[1][0] === "auth");
  expect(auth.length).toBe(1);
});

test("me reads the signed-in user's uuid from the JSON:API index", async () => {
  cliWithToken();
  env.fetch = async (url, opts) => jsonapiServer([], "https://bakers.test", "u-me")(url, opts);
  expect(await api.me()).toBe("u-me");
  expect(fetched()).toEqual(["https://bakers.test/jsonapi"]);
});

test("me is null when the index names no user", async () => {
  cliWithToken();
  env.fetch = async (url, opts) => jsonapiServer([], "https://bakers.test", null)(url, opts);
  expect(await api.me()).toBeNull();
});

test("me is null when the request fails", async () => {
  cliWithToken();
  env.fetch = async () => {
    throw new Error("down");
  };
  expect(await api.me()).toBeNull();
});

test("me is null through bakers dropsh, which has no index", async () => {
  env.exec = async () => ({ code: 1, stdout: "", stderr: "error: unknown command 'token'" });
  expect(await api.me()).toBeNull();
  expect(fetched()).toEqual([]);
});

test("search sends a sparse fieldset per type as fields[type--bundle]", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => doc([]),
    text: async () => "",
  });
  await api.search("bb_ticket", "bb_ticket", {
    fields: {
      "bb_ticket--bb_ticket": ["identifier", "title"],
      "bb_run--bb_run": ["state"],
    },
  });
  const url = decodeURIComponent(fetched()[0]);
  expect(url).toContain("fields[bb_ticket--bb_ticket]=identifier,title");
  expect(url).toContain("fields[bb_run--bb_run]=state");
});

test("the fake server returns only the listed fields, in data and in included", async () => {
  const server = jsonapiServer([
    {
      type: "bb_ticket--bb_ticket",
      id: "t1",
      attributes: { identifier: "SHOP-1", title: "A", body: "long" },
      relationships: { runs: { data: [{ type: "bb_run--bb_run", id: "r1" }] } },
    },
    {
      type: "bb_run--bb_run",
      id: "r1",
      attributes: { state: "done", agent: "x" },
      relationships: { ticket_id: { data: { type: "bb_ticket--bb_ticket", id: "t1" } } },
    },
  ]);
  cliWithToken();
  env.fetch = server;
  const out: any = await (
    await server(
      "https://bakers.test/jsonapi/bb_ticket/bb_ticket?include=runs" +
        "&fields[bb_ticket--bb_ticket]=identifier&fields[bb_run--bb_run]=state",
      { headers: { Authorization: "Bearer abc" } },
    )
  ).json();
  expect(out.data[0].attributes).toEqual({ identifier: "SHOP-1" });
  expect(out.data[0].relationships).toBeUndefined();
  expect(out.data[0]).toMatchObject({ type: "bb_ticket--bb_ticket", id: "t1" });
  expect(out.included[0].attributes).toEqual({ state: "done" });
  expect(out.included[0].relationships).toBeUndefined();
});

test("the fake server keeps listed relationships and supports NOT IN", async () => {
  const mk = (id: string, kind: string) => ({
    type: "bb_comment--bb_comment",
    id,
    attributes: { kind, body: id },
    relationships: { ticket_id: { data: { type: "bb_ticket--bb_ticket", id: "t1" } } },
  });
  const server = jsonapiServer([mk("c1", "plan"), mk("c2", "note"), mk("c3", "spec")]);
  const res: any = await (
    await server(
      "https://bakers.test/jsonapi/bb_comment/bb_comment?" +
        "filter[f0][condition][path]=kind&filter[f0][condition][operator]=NOT IN" +
        "&filter[f0][condition][value][]=plan&filter[f0][condition][value][]=spec" +
        "&fields[bb_comment--bb_comment]=ticket_id",
      { headers: { Authorization: "Bearer abc" } },
    )
  ).json();
  expect(res.data.map((r: any) => r.id)).toEqual(["c2"]);
  expect(res.data[0].attributes).toEqual({});
  expect(res.data[0].relationships.ticket_id.data.id).toBe("t1");
});

test("a parallel cold start asks the CLI for one token", async () => {
  cliWithToken();
  env.fetch = async () => ({
    status: 200,
    ok: true,
    json: async () => doc([]),
    text: async () => "",
  });
  await Promise.all([api.search("x", "x"), api.search("x", "x"), api.search("x", "x")]);
  expect(env.calls.filter((c) => c.fn === "exec").length).toBe(1);
});

test("staggered 401s of one expired token ask for at most one new token", async () => {
  let n = 0;
  env.exec = async (_c, argv) =>
    argv[0] === "auth" && argv[1] === "token"
      ? { code: 0, stdout: JSON.stringify({ ...TOKEN, token: n++ ? `t${n}` : "old" }), stderr: "" }
      : { code: 1, stdout: "", stderr: "unexpected" };
  let delay = 0;
  env.fetch = async (_u, opts) => {
    delay += 5;
    await new Promise((r) => setTimeout(r, delay));
    const ok = opts.headers.Authorization !== "Bearer old";
    return {
      status: ok ? 200 : 401,
      ok,
      json: async () => doc({ type: "x", id: "1" }),
      text: async () => "",
    };
  };
  const rows = await Promise.all([
    api.read("x", "x", "1"),
    api.read("x", "x", "1"),
    api.read("x", "x", "1"),
  ]);
  expect(rows.map((r) => r.id)).toEqual(["1", "1", "1"]);
  expect(env.calls.filter((c) => c.fn === "exec").length).toBeLessThanOrEqual(2);
});
