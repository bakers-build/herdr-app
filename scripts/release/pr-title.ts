// CI check: a PR title is a Conventional Commits header, because the squash merge into `next`
// makes it the commit that decides the version bump. The title comes in through the PR_TITLE
// environment variable only, never interpolated into a shell command.
//   PR_TITLE="feat(ticket): x" bun scripts/release/pr-title.ts
import { KNOWN_TYPES, parseHeader } from "./conventional";

export function checkTitle(title: string): string | null {
  if (parseHeader(title)) return null;
  return `PR title must be "<type>(<scope>)!: <subject>" with type one of: ${KNOWN_TYPES.join(", ")}; scope and ! are optional`;
}

if (import.meta.main) {
  const message = checkTitle(process.env.PR_TITLE ?? "");
  if (message) {
    console.error(message);
    process.exit(1);
  }
  console.log("PR title ok");
}
