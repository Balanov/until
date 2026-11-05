import { existsSync } from "node:fs";

export function actualNodeBinary() {
  if (process.env.UNTIL_NODE_BIN) return process.env.UNTIL_NODE_BIN;
  if (process.platform === "win32" && /Kimi\.exe$/i.test(process.execPath)) {
    const candidate = "C:\\Program Files\\nodejs\\node.exe";
    if (existsSync(candidate)) return candidate;
  }
  return process.execPath;
}
