import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { actualNodeBinary } from "./node-binary.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ...readdirSync(path.join(root, "src")).filter((file) => file.endsWith(".js")).map((file) => path.join(root, "src", file)),
  ...readdirSync(path.join(root, "bin")).filter((file) => file.endsWith(".mjs")).map((file) => path.join(root, "bin", file)),
  ...readdirSync(path.join(root, "scripts")).filter((file) => file.endsWith(".mjs")).map((file) => path.join(root, "scripts", file)),
];
for (const file of files) {
  const result = spawnSync(actualNodeBinary(), ["--check", file], { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Syntax checked: ${files.length} files`);
