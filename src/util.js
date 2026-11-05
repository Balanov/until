import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const nowIso = () => new Date().toISOString();
export const newId = (prefix) => `${prefix}_${randomUUID()}`;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function sha256(value) {
  const input = typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value);
  return createHash("sha256").update(input).digest("hex");
}

export function parseJson(text, label = "JSON") {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is invalid: ${error.message}`, { cause: error });
  }
}

export function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

export function assertText(value, label, { min = 1, max = 32_000 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new Error(`${label} must contain ${min}–${max} characters`);
  }
  return value.trim();
}

export function safeNumber(value, label, { min = -1e15, max = 1e15 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be a finite number in ${min}–${max}`);
  }
  return number;
}

export function resolveInside(root, candidate) {
  if (typeof candidate !== "string" || candidate.includes("\0")) {
    throw new Error("Invalid artifact path");
  }
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, candidate);
  const relative = path.relative(absoluteRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${candidate}`);
  }
  return absolute;
}

export async function atomicWrite(file, content, { fsync = false } = {}) {
  const target = path.resolve(file);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  if (fsync) {
    const handle = await open(temporary, "wx");
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } else {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  }
  await rename(temporary, target);
}

export function sleep(ms, { signal } = {}) {
  if (!Number.isFinite(ms) || ms < 0) throw new Error("Invalid sleep duration");
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Aborted"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    }, { once: true });
  });
}

export function stableKey(parts) {
  return sha256(canonicalJson(parts));
}

export function redact(value) {
  const secretKey = /(?:api[_-]?key|authorization|password|secret|token|credential|cookie)/i;
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    secretKey.test(key) ? "[REDACTED]" : redact(item),
  ]));
}
