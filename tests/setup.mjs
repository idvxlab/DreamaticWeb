import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
const dir = mkdtempSync(path.join(os.tmpdir(), "dreamatic-tests-"));
process.env.DREAMATIC_WORKSPACE = dir;
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
