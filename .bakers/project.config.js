// @bakers-schema-version 1
// The project's bakers.build configuration — committed and identical for
// everyone. A conductor is this machine (machine.config.js) + this project +
// the variant (project.<name>.config.js). Connections are private files.
//
// The slots are `{ use, export?, with? }` descriptors naming the published
// package; the loader resolves each name (config dir → cwd → CLI install).

/** @type {import('@bakers-build/core').ProjectConfig} */
export default {
  schema_version: 1,
  project: { name: "herdr-app" },
  // The run budget (max_parallel) is set on the machine in the backend.
  // Transcripts upload only where the server's run-log storage allows it.
  // Set to false to keep this conductor's transcripts local even then.
  // Metrics are unaffected either way.
  capture_logs: true,
  server: { use: '@bakers-build/addon-remote-drupal' },
  // herdr-core runs each agent in a herdr-core terminal; Git workspace makes the worktree.
  // Runs fetch, push, open PRs, read checks and merge only through the forge tools; the
  // conductor's own `gh` login supplies the token, which no run sees.
  addons: [
    '@bakers-build/addon-herdr-core',
    '@bakers-build/addon-workspace-git',
    {
      use: '@bakers-build/addon-forge',
      with: {
        merge: { main: { method: 'squash', delete_source: true } },
        backend: { use: '@bakers-build/addon-forge-github', with: { repository: 'bakers-build/herdr-app', auth: 'gh' } },
      },
    },
  ],
  // Live checks drive the developer's Herdr: its socket and ~/.config/herdr-app lie outside the
  // sandbox, so these two commands run unsandboxed. Applies only where the machine runs sandbox mode.
  permissions: { sandbox: { trusted_commands: ['herdr-app', 'bun run install:herdr'] } },
  // The agent plugins every run gets: the bakers skills and the superpowers recipe.
  marketplaces: [
    { url: 'https://github.com/bakers-build/bakers-build.git', ref: 'next', plugins: ['bakers'] },
    { url: 'https://github.com/obra/superpowers.git', ref: 'v7.0.0', plugins: ['superpowers'] },
    { url: 'https://github.com/mattpocock/skills.git', ref: 'v1.3.2', plugins: ['mattpocock-skills'] },
  ],
};
