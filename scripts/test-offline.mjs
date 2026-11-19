// Functional tests only: synthetic inputs, temporary workspaces, loopback mock APIs.
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const files = (await readdir("tests"))
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => "tests/" + name);
// Do not inherit model credentials or server/deployment configuration from the shell.
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR || "/tmp",
  LANG: "en_US.UTF-8",
  ...(process.env.CHROME_PATH ? { CHROME_PATH: process.env.CHROME_PATH } : {}),
  NODE_OPTIONS: `--import=${JSON.stringify(path.resolve("tests/offline-network.mjs"))}`,
};
const child = spawn(
  process.execPath,
  [
    "--import",
    "./tests/setup.mjs",
    "--import",
    "tsx",
    "--test",
    "--test-concurrency=1",
    ...files,
  ],
  { env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
