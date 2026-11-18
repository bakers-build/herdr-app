// Conventional Commits: parse a commit's header, decide the version bump and render the
// release notes. Only a commit's first line is a header; its body counts only for a
// `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer, so a squash's list of branch commits
// does not bump. See docs/superpowers/specs/2026-11-17-release-design.md.

export type Commit = { sha: string; subject: string; body: string };
export type Change = {
  sha: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  subject: string;
};

export const KNOWN_TYPES = [
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
] as const;

const HEADER = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: /m;

/** The header of a Conventional Commit; scope is null without parentheses. */
export function parseHeader(
  line: string,
): { type: string; scope: string | null; bang: boolean; subject: string } | null {
  const m = HEADER.exec(line);
  if (!m || !(KNOWN_TYPES as readonly string[]).includes(m[1])) return null;
  const subject = m[4].trim();
  if (!subject) return null;
  return { type: m[1], scope: m[2] ?? null, bang: m[3] === "!", subject };
}

export function toChange(c: Commit): Change | null {
  const h = parseHeader(c.subject);
  if (!h) return null;
  return {
    sha: c.sha,
    type: h.type,
    scope: h.scope,
    breaking: h.bang || BREAKING_FOOTER.test(c.body),
    subject: h.subject,
  };
}

/** 2 = major, 1 = minor, 0 = patch, -1 = nothing. */
function level(c: Change, major: number): number {
  if (c.breaking) return major === 0 ? 1 : 2;
  if (c.type === "feat") return 1;
  if (c.type === "fix" || c.type === "perf") return 0;
  return -1;
}

export function bump(version: string, changes: Change[]): string | null {
  const [major, minor, patch] = version.split(".").map(Number);
  const top = Math.max(-1, ...changes.map((c) => level(c, major)));
  if (top === 2) return `${major + 1}.0.0`;
  if (top === 1) return `${major}.${minor + 1}.0`;
  if (top === 0) return `${major}.${minor}.${patch + 1}`;
  return null;
}

const bullet = (c: Change) =>
  `- ${c.scope ? `**${c.scope}:** ` : ""}${c.subject} (${c.sha.slice(0, 7)})`;

export function renderNotes(changes: Change[]): string {
  const sections: [string, Change[]][] = [
    ["Breaking changes", changes.filter((c) => c.breaking)],
    ["Features", changes.filter((c) => !c.breaking && c.type === "feat")],
    ["Fixes", changes.filter((c) => !c.breaking && (c.type === "fix" || c.type === "perf"))],
  ];
  return sections
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => `### ${title}\n\n${list.map(bullet).join("\n")}\n`)
    .join("\n");
}
