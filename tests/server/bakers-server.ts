// The self-hosted bakers server for the contract and E2E runs: starts the release image, installs
// it on SQLite, seeds the server's own e2e test world (scripts/e2e/seed-test-world.sh), creates an
// API key for the seeded user fixture-agent and two plan comments on the fixture ticket. Needs
// Docker; the image is public. The contract and E2E runs use different container names and ports,
// so both can run at once.

import { randomBytes } from "node:crypto";
import { join } from "node:path";

/** bakers-build 0.11.0, the php image (Drupal and drush; linux/amd64 only). */
export const IMAGE =
  "ghcr.io/bakers-build/bakers-build/php:0.11.0@sha256:80d8f4979c97577d8613de71044f68a7a9d40d5ec53a528daa05dc651ae8e8e2";
export const CONTRACT_SERVER = { name: "herdr-contract", port: 18080 };
export const E2E_SERVER = { name: "herdr-e2e", port: 18081 };

/** settings.sqlite.php, key.php and comments.php live beside the contract test. */
const FILES = join(import.meta.dir, "..", "contract");

export type Server = {
  url: string;
  /** client_id:secret of fixture-agent's API key (client credentials). */
  key: string;
  project: string;
  ticket: string;
  stop(): void;
};

function sh(args: string[], what: string): string {
  const r = Bun.spawnSync(args, { stderr: "pipe" });
  if (r.exitCode !== 0)
    throw new Error(`${what} failed (${r.exitCode}):\n${r.stderr.toString().slice(-2000)}`);
  return r.stdout.toString();
}

/** Waits until the server answers, at most `ms` (the server starts in the background). */
async function healthy(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${url}/user/login`)).ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(500);
  }
  throw new Error(`the server at ${url} did not answer within ${ms} ms`);
}

export async function startServer(o: {
  name: string;
  port: number;
  log?: (line: string) => void;
}): Promise<Server> {
  const { name } = o;
  const url = `http://127.0.0.1:${o.port}`;
  const step = o.log ?? (() => {});
  const exec = (script: string, what: string, user = "wodby") =>
    sh(["docker", "exec", "-u", user, name, "sh", "-c", script], what);
  const stop = () => {
    Bun.spawnSync(["docker", "rm", "-f", name]);
  };
  stop();
  step(`starting ${IMAGE.split("@")[0]}`);
  sh(
    [
      "docker",
      "run",
      "-d",
      "--name",
      name,
      "--platform",
      "linux/amd64",
      "-p",
      `127.0.0.1:${o.port}:8080`,
      "-e",
      "DB_HOST=sqlite",
      "-e",
      "DB_NAME=/tmp/bb.sqlite",
      "-e",
      `DRUPAL_HASH_SALT=${randomBytes(24).toString("hex")}`,
      "-v",
      `${join(FILES, "settings.sqlite.php")}:/var/www/html/web/sites/default/settings.container.php:ro`,
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
    `cd /var/www/html && ARTIFACT_DIR=/tmp/e2e BASE_URL=${url} bash scripts/e2e/seed-test-world.sh`,
    "seed",
  );
  sh(["docker", "cp", join(FILES, "key.php"), `${name}:/tmp/key.php`], "docker cp");
  const key = exec(
    "cd /var/www/html && vendor/bin/drush php:script /tmp/key.php -- fixture-agent",
    "API key",
  ).trim();
  const fixtures = JSON.parse(exec("cat /tmp/e2e/fixtures.json", "fixtures"));
  // The seeded world has no ticket with two plan comments; the folded older ones need one.
  sh(["docker", "cp", join(FILES, "comments.php"), `${name}:/tmp/comments.php`], "docker cp");
  const seeded = exec(
    `cd /var/www/html && vendor/bin/drush php:script /tmp/comments.php -- ${fixtures.ticket_uuid} fixture-agent`,
    "plan comments",
  );
  step(`seeded plan comments ${seeded.trim()}`);
  sh(
    [
      "docker",
      "exec",
      "-d",
      name,
      "sh",
      "-c",
      "cd /var/www/html && exec php -S 0.0.0.0:8080 -t web /var/www/html/web/.ht.router.php",
    ],
    "php -S",
  );
  await healthy(url, 60_000);
  step(`up at ${url}`);
  return {
    url,
    key,
    project: String(fixtures.project_uuid),
    ticket: String(fixtures.ticket_uuid),
    stop,
  };
}
