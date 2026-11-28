// The contract run: starts the seeded bakers server (tests/server/bakers-server.ts), runs
// tests/contract/*.test.ts against it and removes the container again. Needs Docker.
//   bun run test:contract          (CI job `contract` runs the same)
//   KEEP=1 bun run test:contract   keeps the container for a look afterwards

import { join } from "node:path";
import { CONTRACT_SERVER, startServer } from "../server/bakers-server";

const HERE = import.meta.dir;

if (import.meta.main) {
  let code = 1;
  try {
    const server = await startServer({
      name: CONTRACT_SERVER.name,
      port: Number(process.env.CONTRACT_PORT ?? CONTRACT_SERVER.port),
      log: (s) => process.stdout.write(`contract: ${s}\n`),
    });
    // A real server answers slower than the stubs, under emulation (arm64 hosts) much slower.
    const r = Bun.spawnSync(["bun", "test", "--timeout", "60000", join(HERE)], {
      env: {
        ...process.env,
        BAKERS_CONTRACT_URL: server.url,
        BAKERS_CONTRACT_KEY: server.key,
        BAKERS_CONTRACT_PROJECT: server.project,
        BAKERS_CONTRACT_TICKET: server.ticket,
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    code = r.exitCode ?? 1;
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
  } finally {
    if (!process.env.KEEP) Bun.spawnSync(["docker", "rm", "-f", CONTRACT_SERVER.name]);
  }
  process.exit(code);
}
