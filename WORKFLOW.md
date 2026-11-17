# herdr-app — WORKFLOW

Invoke `bakers:bb-workflow` and follow it for the ticket's current state.

The sections below apply **only to tickets of type `deployment`** (recipe
`bb-recipe-deploy-and-release`). They record what herdr-app uses instead of the recipe's parts that
assume a deployed server, an npm package or GitLab. herdr-app ships the bakers mod as a GitHub
release: a ZIP of `mods/bakers` and its installer. Other ticket types ignore these sections.

| Recipe | herdr-app |
|---|---|
| `pnpm --dir bakers-cli run release:version <SHA> --notes -` | `bun run release:version <SHA> --notes -` |
| integration branch `develop` | `next` |
| `min_client_version` check on breaking server commits | none: there is no server |
| deploy watch and HTTP 200 from `<base_url>/user/login` | none: nothing is deployed. Instead, the `release` job on the merge SHA is green (`forge_checks`) and its log (`forge_job_log`) shows `released v<x.y.z>` and `asset: herdr-bakers-<x.y.z>.zip` |
| GitLab release in `links` | the GitHub release URL from the job log, in `links` |
| `npm view` at review | the GitHub release `v<x.y.z>` (not a pre-release) carries `herdr-bakers-<x.y.z>.zip`, and the tag points at the frozen SHA (`forge_fetch`, then `git rev-parse v<x.y.z>^{commit}`) |

## bb-phase-work

For tickets of type `deployment`: freeze a SHA of `next` and run the dry run
`bun run release:version <SHA> --notes -` on it. Never pass `--pre` in a deployment dry run: `--pre`
is only for the `-next.N` pre-releases the `release` job publishes on pushes to `next`. Empty
output means there is nothing to release; stop and report it. There is no `min_client_version`
check.

## bb-phase-deliver

For tickets of type `deployment`: one MR from the frozen SHA into `main`, titled
`chore(release): <x.y.z>`, merged as a merge commit (source kept). The `release` job on `main`
tags `HEAD^2` of that merge (the frozen `next` SHA) as `v<x.y.z>` and creates the GitHub release.
There is no environment deploy and no `<base_url>/user/login` check: success is the green `release`
job, read with `forge_checks`, and its log, read with `forge_job_log`, showing `released v<x.y.z>`
and `asset: herdr-bakers-<x.y.z>.zip`. Put the GitHub release URL from that log in the ticket's
`links` instead of a GitLab release.

## bb-phase-transition

For tickets of type `deployment`, at review: instead of `npm view`, check that the GitHub release
`v<x.y.z>` exists, is not a pre-release and carries `herdr-bakers-<x.y.z>.zip`, and that the tag
points at the frozen SHA (`forge_fetch`, then `git rev-parse v<x.y.z>^{commit}`).
