import { describe, expect, test } from "bun:test";
import {
  bump,
  type Change,
  KNOWN_TYPES,
  parseHeader,
  renderNotes,
  toChange,
} from "../scripts/release/conventional";

const change = (type: string, over: Partial<Change> = {}): Change => ({
  sha: "abc1234def5678",
  type,
  scope: null,
  breaking: false,
  subject: `${type} subject`,
  ...over,
});

describe("parseHeader", () => {
  test("reads type, scope, bang and subject", () => {
    expect(parseHeader("feat(ticket)!: add x")).toEqual({
      type: "feat",
      scope: "ticket",
      bang: true,
      subject: "add x",
    });
  });

  test("reads a header without scope or bang", () => {
    expect(parseHeader("fix: y")).toEqual({ type: "fix", scope: null, bang: false, subject: "y" });
  });

  test("rejects non-conforming lines and unknown types", () => {
    expect(parseHeader("Merge branch x")).toBeNull();
    expect(parseHeader("feature: x")).toBeNull();
    expect(parseHeader("feat:x")).toBeNull();
    expect(parseHeader("feat: ")).toBeNull();
  });

  test("keeps the subject after the first colon verbatim", () => {
    expect(parseHeader("fix: a: b `c` #12")?.subject).toBe("a: b `c` #12");
  });

  test("knows the documented types", () => {
    expect([...KNOWN_TYPES]).toEqual([
      "feat",
      "fix",
      "perf",
      "chore",
      "docs",
      "ci",
      "test",
      "refactor",
      "style",
      "build",
      "revert",
    ]);
  });
});

describe("toChange", () => {
  test("a BREAKING CHANGE footer marks breaking", () => {
    expect(toChange({ sha: "s", subject: "fix: x", body: "text\n\nBREAKING CHANGE: y" })).toEqual({
      sha: "s",
      type: "fix",
      scope: null,
      breaking: true,
      subject: "x",
    });
    expect(toChange({ sha: "s", subject: "fix: x", body: "BREAKING-CHANGE: y" })?.breaking).toBe(
      true,
    );
  });

  test("header-shaped body lines change nothing", () => {
    expect(toChange({ sha: "s", subject: "chore: squash", body: "* feat: z\nfeat!: w" })).toEqual({
      sha: "s",
      type: "chore",
      scope: null,
      breaking: false,
      subject: "squash",
    });
  });

  test("a non-conforming subject is no change", () => {
    expect(toChange({ sha: "s", subject: "Update README", body: "" })).toBeNull();
  });
});

describe("bump", () => {
  test("follows the bump table", () => {
    expect(bump("0.0.0", [change("feat")])).toBe("0.1.0");
    expect(bump("0.1.0", [change("fix")])).toBe("0.1.1");
    expect(bump("0.1.0", [change("perf")])).toBe("0.1.1");
    expect(bump("0.1.3", [change("fix", { breaking: true })])).toBe("0.2.0");
    expect(bump("1.2.3", [change("chore", { breaking: true })])).toBe("2.0.0");
    expect(bump("1.2.3", [change("feat"), change("fix")])).toBe("1.3.0");
  });

  test("returns null when nothing is releasable", () => {
    expect(bump("1.2.3", [change("chore"), change("docs")])).toBeNull();
    expect(bump("1.2.3", [])).toBeNull();
  });
});

describe("renderNotes", () => {
  test("orders sections, omits empty ones and formats bullets", () => {
    const notes = renderNotes([
      change("fix", { sha: "1111111aaaa", subject: "fix y" }),
      change("chore", { sha: "2222222bbbb", subject: "tidy" }),
      change("feat", { sha: "3333333cccc", scope: "ticket", subject: "add x" }),
      change("feat", { sha: "4444444dddd", breaking: true, subject: "drop z" }),
      change("perf", { sha: "5555555eeee", subject: "faster" }),
    ]);
    expect(notes).toBe(
      [
        "### Breaking changes",
        "",
        "- drop z (4444444)",
        "",
        "### Features",
        "",
        "- **ticket:** add x (3333333)",
        "",
        "### Fixes",
        "",
        "- fix y (1111111)",
        "- faster (5555555)",
        "",
      ].join("\n"),
    );
  });

  test("leaves out the breaking section when there is none", () => {
    expect(renderNotes([change("fix", { sha: "abcdef0123", subject: "f" })])).toBe(
      "### Fixes\n\n- f (abcdef0)\n",
    );
  });
});
