// The E2E run: the real Herdr window with the bakers mod against the seeded bakers server,
// nothing stubbed. Starts the server (tests/server/bakers-server.ts), signs the real bakers CLI
// in without a browser (client credentials of fixture-agent's API key), starts Herdr with every
// home in a temp directory, installs the mod as a developer does (scripts/install.ts), switches
// to the bakers layout and runs tests/e2e/*.e2e.test.ts against the window.
// Needs Docker, the bakers CLI on PATH and Herdr (HERDR_APP, an installed herdr-app, or on Linux
// the pinned build). Locally on macOS a real (isolated) Herdr window opens.
//   bun run test:e2e          (CI job `e2e` runs it under xvfb-run)
//   KEEP=1 bun run test:e2e   keeps the window, the container and the temp directory

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { download } from "../../scripts/check/herdr-check";
import { install } from "../../scripts/install";
import { E2E_SERVER, type Server, startServer } from "../server/bakers-server";
import { e2eEnv, herdrCli, readShared, tempRoot, waitFor } from "./herdr";

const ROOT = join(import.meta.dir, "../..");
const step = (s: string) => process.stdout.write(`e2e: ${s}\n`);

function bakers(env: Record<string, string>, cwd: string, ...args: string[]) {
  const r = Bun.spawnSync(["bakers", ...args], { env, cwd, stderr: "pipe" });
  return { code: r.exitCode ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
}

/** Signs the CLI in for connection e2e: config init, then a client-credentials login. */
function signIn(env: Record<string, string>, tmp: string, server: Server) {
  const sep = server.key.indexOf(":");
  const init = bakers(
    { ...env, BAKERS_E2E_SECRET: server.key.slice(sep + 1) },
    tmp,
    "config",
    "init",
    "--scope",
    "connection",
    "--connection",
    "e2e",
    "--base-url",
    server.url,
    "--client-id",
    server.key.slice(0, sep),
    "--secret-env",
    "BAKERS_E2E_SECRET",
    "--auth-type",
    "client_credentials",
    "--yes",
    "--format",
    "json",
  );
  let report: any = null;
  try {
    report = JSON.parse(init.out);
  } catch {
    // reported below
  }
  if (init.code !== 0 || report?.result === "failed")
    throw new Error(
      `bakers config init failed (${init.code}): ${JSON.stringify(report?.findings ?? init.err)}`,
    );
  const login = bakers(env, tmp, "auth", "login", "--provider", "bakers");
  if (login.code !== 0) throw new Error(`bakers auth login failed (${login.code}): ${login.err}`);
  const token = bakers(env, tmp, "auth", "token");
  if (token.code !== 0 || !JSON.parse(token.out).token)
    throw new Error(`bakers auth token failed (${token.code}): ${token.err}`);
}

async function herdrBinary(): Promise<string> {
  const pin = JSON.parse(readFileSync(join(ROOT, "types/herdr-version.json"), "utf8"));
  return process.env.HERDR_APP || Bun.which("herdr-app") || (await download(pin.herdr, pin.builds));
}

/** What the window showed, for a failed run. */
function dump(bin: string, env: Record<string, string>) {
  for (const what of ["status", "ls"])
    process.stderr.write(`e2e: herdr-app ${what}:\n${herdrCli(bin, env, what).text}\n`);
  process.stderr.write(
    `e2e: shared.json:\n${JSON.stringify(readShared(env.HERDR_APP_HOME), null, 2)}\n`,
  );
}

if (import.meta.main) {
  let code = 1;
  const tmp = mkdtempSync(join(tempRoot(), "he2e-"));
  const env = e2eEnv(process.env, tmp);
  for (const dir of [env.HOME, env.HERDR_APP_HOME, env.BAKERS_HOME])
    mkdirSync(dir, { recursive: true });
  let server: Server | null = null;
  let app: ReturnType<typeof Bun.spawn> | null = null;
  let bin = "";
  try {
    server = await startServer({ ...E2E_SERVER, log: step });
    signIn(env, tmp, server);
    step("bakers CLI signed in (client credentials, connection e2e)");

    // The seeded project skips the picker; the open list needs no signed-in user.
    writeFileSync(
      join(env.HERDR_APP_HOME, "shared.json"),
      JSON.stringify({ "bakers.project": server.project, "bakers.view": "open" }),
    );
    bin = await herdrBinary();
    app = Bun.spawn([bin], {
      env,
      stdout: Bun.file(join(tmp, "herdr.log")),
      stderr: Bun.file(join(tmp, "herdr.err")),
    });
    await waitFor(
      async () => {
        const s = herdrCli(bin, env, "status");
        if (s.code !== 0) throw new Error(s.text.trim() || `exit ${s.code}`);
        return s.json;
      },
      60_000,
      "the Herdr window to answer",
    );
    step(`Herdr answers (${bin})`);
    await waitFor(
      async () => (existsSync(join(env.HERDR_APP_HOME, "layouts", "main.json")) ? true : null),
      30_000,
      "Herdr's layouts/main.json",
    );
    await install({ home: env.HERDR_APP_HOME, log: (l) => step(l) });
    // A fresh herdr-core has no space; tabs need one.
    for (const args of [
      ["do", "space.new", JSON.stringify({ name: "e2e", folder: tmp })],
      ["do", "layout.switch", "--name", "bakers"],
    ]) {
      const r = herdrCli(bin, env, ...args);
      if (r.code !== 0) throw new Error(`herdr-app ${args.join(" ")}: ${r.text}`);
    }
    step("mod installed, bakers layout shown");

    const r = Bun.spawnSync(["bun", "test", "--timeout", "120000", import.meta.dir], {
      env: {
        ...process.env,
        HERDR_APP: bin,
        HERDR_APP_HOME: env.HERDR_APP_HOME,
        BAKERS_E2E_HOME: env.HERDR_APP_HOME,
        BAKERS_E2E_URL: server.url,
        BAKERS_E2E_KEY: server.key,
        BAKERS_E2E_PROJECT: server.project,
      },
      cwd: ROOT,
      stdout: "inherit",
      stderr: "inherit",
    });
    code = r.exitCode ?? 1;
  } catch (e) {
    process.stderr.write(`e2e: ${(e as Error).message}\n`);
  } finally {
    if (code !== 0 && app) {
      dump(bin, env);
      const err = join(tmp, "herdr.err");
      if (existsSync(err))
        process.stderr.write(
          `e2e: Herdr stderr (tail):\n${readFileSync(err, "utf8").slice(-3000)}\n`,
        );
    }
    if (!process.env.KEEP) {
      app?.kill();
      await app?.exited;
      // The window's own herdr-core (HOME is the temp one): stop it, never another.
      const hc = ["hc", "herdr-core"]
        .flatMap((n) => [Bun.which(n, { PATH: env.PATH }), bin && join(dirname(bin), n)])
        .find((p): p is string => Boolean(p && existsSync(p)));
      if (hc) Bun.spawnSync([hc, "server", "stop"], { env, stdout: "ignore", stderr: "ignore" });
      server?.stop();
      rmSync(tmp, { recursive: true, force: true });
    } else step(`kept: ${tmp}, container ${E2E_SERVER.name}`);
  }
  process.exit(code);
}
