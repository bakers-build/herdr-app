// The contract run: starts the self-hosted bakers server from its release image, installs it
// on SQLite, seeds the server's own e2e test world (scripts/e2e/seed-test-world.sh), creates an
// API key for the seeded user fixture-agent, two plan comments on the fixture ticket, runs tests/contract/*.test.ts against it and
// removes the container again. Needs Docker; the image is public.
//   bun run test:contract          (CI job `contract` runs the same)
//   KEEP=1 bun run test:contract   keeps the container for a look afterwards

import { randomBytes } from "node:crypto";
import { join } from "node:path";

/** bakers-build 0.11.0, the php image (Drupal and drush; linux/amd64 only). */
export const IMAGE =
  "ghcr.io/bakers-build/bakers-build/php:0.11.0@sha256:80d8f4979c97577d8613de71044f68a7a9d40d5ec53a528daa05dc651ae8e8e2";
const NAME = "herdr-contract";
const PORT = Number(process.env.CONTRACT_PORT ?? 18080);
const URL = `http://127.0.0.1:${PORT}`;
const HERE = import.meta.dir;

function sh(args: string[], what: string): string {
  const r = Bun.spawnSync(args, { stderr: "pipe" });
  if (r.exitCode !== 0)
    throw new Error(`${what} failed (${r.exitCode}):\n${r.stderr.toString().slice(-2000)}`);
  return r.stdout.toString();
}
const exec = (script: string, what: string, user = "wodby") =>
  sh(["docker", "exec", "-u", user, NAME, "sh", "-c", script], what);

/** Waits until the server answers, at most `ms` (the server starts in the background). */
async function healthy(ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${URL}/user/login`)).ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(500);
  }
  throw new Error(`the server at ${URL} did not answer within ${ms} ms`);
}

async function up() {
  Bun.spawnSync(["docker", "rm", "-f", NAME]);
  const step = (s: string) => process.stdout.write(`contract: ${s}\n`);
  step(`starting ${IMAGE.split("@")[0]}`);
  sh(
    [
      "docker",
      "run",
      "-d",
      "--name",
      NAME,
      "--platform",
      "linux/amd64",
      "-p",
      `127.0.0.1:${PORT}:8080`,
      "-e",
      "DB_HOST=sqlite",
      "-e",
      "DB_NAME=/tmp/bb.sqlite",
      "-e",
      `DRUPAL_HASH_SALT=${randomBytes(24).toString("hex")}`,
      "-v",
      `${join(HERE, "settings.sqlite.php")}:/var/www/html/web/sites/default/settings.container.php:ro`,
      "--entrypoint",
      "sleep",
      IMAGE,
      "infinity",
    ],
    "docker run",
  );
  exec(
    "mkdir -p /var/www/oauth-keys /tmp/private && chown wodby:wodby /var/www/oauth-keys /tmp/private",
    "key folders",
    "root",
  );
  step("installing from config/sync on SQLite");
  exec(
    "cp -r /var/www/html/config/sync /tmp/sync && sed -i 's/^  mysql: 0$/  mysql: 0\\n  sqlite: 0/' /tmp/sync/core.extension.yml && cd /var/www/html && vendor/bin/drush -y site:install --existing-config",
    "site:install",
  );
  step("seeding the e2e test world");
  exec(
    `cd /var/www/html && ARTIFACT_DIR=/tmp/e2e BASE_URL=${URL} bash scripts/e2e/seed-test-world.sh`,
    "seed",
  );
  sh(["docker", "cp", join(HERE, "key.php"), `${NAME}:/tmp/key.php`], "docker cp");
  const key = exec(
    "cd /var/www/html && vendor/bin/drush php:script /tmp/key.php -- fixture-agent",
    "API key",
  ).trim();
  const fixtures = JSON.parse(exec("cat /tmp/e2e/fixtures.json", "fixtures"));
  // The seeded world has no ticket with two plan comments; the folded older ones need one.
  sh(["docker", "cp", join(HERE, "comments.php"), `${NAME}:/tmp/comments.php`], "docker cp");
  exec(
    `cd /var/www/html && vendor/bin/drush php:script /tmp/comments.php -- ${fixtures.ticket_uuid} fixture-agent`,
    "plan comments",
  );
  sh(
    [
      "docker",
      "exec",
      "-d",
      NAME,
      "sh",
      "-c",
      "cd /var/www/html && exec php -S 0.0.0.0:8080 -t web /var/www/html/web/.ht.router.php",
    ],
    "php -S",
  );
  await healthy(60_000);
  step(`up at ${URL}`);
  return {
    BAKERS_CONTRACT_URL: URL,
    BAKERS_CONTRACT_KEY: key,
    BAKERS_CONTRACT_PROJECT: String(fixtures.project_uuid),
    BAKERS_CONTRACT_TICKET: String(fixtures.ticket_uuid),
  };
}

if (import.meta.main) {
  let code = 1;
  try {
    const vars = await up();
    // A real server answers slower than the stubs, under emulation (arm64 hosts) much slower.
    const r = Bun.spawnSync(["bun", "test", "--timeout", "60000", join(HERE)], {
      env: { ...process.env, ...vars },
      stdout: "inherit",
      stderr: "inherit",
    });
    code = r.exitCode ?? 1;
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
  } finally {
    if (!process.env.KEEP) Bun.spawnSync(["docker", "rm", "-f", NAME]);
  }
  process.exit(code);
}
