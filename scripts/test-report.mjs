import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { actualNodeBinary } from "./node-binary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = path.join(root, "test");
const files = (await readdir(testDir)).filter((file) => file.endsWith(".test.mjs")).map((file) => path.join(testDir, file));
const started = new Date().toISOString();
const execution = await new Promise((resolve, reject) => {
  const child = spawn(actualNodeBinary(), ["--test", "--test-reporter=spec", ...files], { cwd: root, shell: false });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolve({ code, stdout, stderr }));
});
const count = (label) => Number(execution.stdout.match(new RegExp(`^ℹ ${label} (\\d+)$`, "m"))?.[1] ?? NaN);
const report = {
  format: "until-test-report/v1",
  generatedAt: started,
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  exitCode: execution.code,
  tests: count("tests"),
  passed: count("pass"),
  failed: count("fail"),
  durationMs: Number(execution.stdout.match(/^ℹ duration_ms ([\d.]+)$/m)?.[1] ?? NaN),
};
if (execution.code !== 0 || !Number.isFinite(report.tests) || report.failed !== 0 || report.passed !== report.tests) {
  console.error(execution.stdout);
  console.error(execution.stderr);
  throw new Error("Test report failed");
}
await mkdir(path.join(root, "app", "public"), { recursive: true });
await writeFile(path.join(root, "app", "public", "tests.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
