import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, canonicalJson, resolveInside, sha256 } from "../util.js";

/**
 * Workspace mutation primitives.
 *
 * The kernel may only change files that the owner explicitly allowed. Every path is
 * resolved inside the workspace root, symlinks are resolved to their real location,
 * and excluded directories are never entered. Nothing here executes code.
 */

export const DEFAULT_EXCLUDES = Object.freeze([
  ".git",
  ".until",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  ".next",
  ".nuxt",
  ".idea",
  ".vscode",
  "coverage",
  ".cache",
]);

export const MAX_EDIT_FILE_BYTES = 2_000_000;
export const MAX_EDIT_FILES = 200;

export function normalizeRelative(relative) {
  if (typeof relative !== "string" || !relative.trim()) throw new Error("Edit path must be a non-empty string");
  const normalized = relative.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Edit path must be workspace-relative: ${relative}`);
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`Edit path must not traverse upwards: ${relative}`);
  }
  return normalized;
}

export function isExcluded(relative, excludes = DEFAULT_EXCLUDES) {
  const segments = relative.replace(/\\/g, "/").split("/");
  return segments.some((segment) => excludes.includes(segment));
}

/**
 * Resolves a workspace-relative path to an absolute path and enforces the allowlist.
 * `allow` accepts exact paths and glob-free prefixes ending in "/".
 */
export function resolveEditablePath(root, relative, { excludes = DEFAULT_EXCLUDES, allow = null } = {}) {
  const normalized = normalizeRelative(relative);
  if (isExcluded(normalized, excludes)) throw new Error(`Edit path is excluded: ${normalized}`);
  const absolute = resolveInside(root, normalized);
  if (allow && allow.length) {
    const permitted = allow.some((entry) => {
      const candidate = normalizeRelative(entry);
      if (candidate.endsWith("/")) return normalized === candidate.slice(0, -1) || normalized.startsWith(candidate);
      return normalized === candidate;
    });
    if (!permitted) throw new Error(`Edit path is not in the allowed set: ${normalized}`);
  }
  return { relative: normalized, absolute };
}

export async function readFileIfExists(absolute) {
  try {
    return await readFile(absolute, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Lists the workspace tree without entering excluded directories.
 * Returns relative POSIX-style paths.
 */
export async function listWorkspaceFiles(root, { excludes = DEFAULT_EXCLUDES, maxFiles = 20_000 } = {}) {
  const files = [];
  const stack = [""];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await readdir(path.join(root, current), { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
      throw error;
    }
    for (const entry of entries) {
      const relative = current ? `${current}/${entry.name}` : entry.name;
      if (excludes.includes(entry.name)) continue;
      if (entry.isDirectory()) {
        stack.push(relative);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(relative);
      if (files.length > maxFiles) throw new Error(`Workspace contains more than ${maxFiles} files`);
    }
  }
  return files.sort();
}

/**
 * Content-hashed manifest of the workspace. Used to prove exactly what changed
 * between acceptance and release, and to restore a failed repair attempt.
 *
 * With `captureContent` the original bytes are kept so a failed attempt can be
 * rolled back exactly — including files written by a builder that edits the
 * workspace itself instead of returning an edit list.
 */
export async function snapshotWorkspace(root, { excludes = DEFAULT_EXCLUDES, maxBytes = 50_000_000, captureContent = false } = {}) {
  const relatives = await listWorkspaceFiles(root, { excludes });
  const files = [];
  const contents = new Map();
  let totalBytes = 0;
  for (const relative of relatives) {
    const absolute = path.resolve(root, relative);
    const info = await stat(absolute);
    totalBytes += info.size;
    if (totalBytes > maxBytes) throw new Error(`Workspace exceeds ${maxBytes} bytes`);
    const bytes = await readFile(absolute);
    files.push({ path: relative, bytes: info.size, sha256: sha256(bytes) });
    if (captureContent) contents.set(relative, bytes);
  }
  return {
    format: "until-workspace-snapshot/v1",
    files,
    totalBytes,
    hash: sha256(canonicalJson(files.map(({ path: file, bytes, sha256: hash }) => ({ path: file, bytes, sha256: hash })))),
    contents: captureContent ? contents : null,
  };
}

export function diffManifests(before, after) {
  const beforeMap = new Map((before?.files ?? []).map((item) => [item.path, item.sha256]));
  const afterMap = new Map((after?.files ?? []).map((item) => [item.path, item.sha256]));
  const added = [];
  const modified = [];
  const removed = [];
  for (const [file, hash] of afterMap) {
    if (!beforeMap.has(file)) added.push(file);
    else if (beforeMap.get(file) !== hash) modified.push(file);
  }
  for (const file of beforeMap.keys()) if (!afterMap.has(file)) removed.push(file);
  return { added: added.sort(), modified: modified.sort(), removed: removed.sort() };
}

/**
 * Applies a bounded set of file edits inside the workspace.
 *
 * Every edit is validated before anything is written. Edits are written atomically.
 * The function returns the resulting changed-file list and a fresh manifest hash so
 * the caller can prove what the change actually was.
 */
export async function applyEdits(root, edits, { excludes = DEFAULT_EXCLUDES, allow = null, dryRun = false } = {}) {
  if (!Array.isArray(edits) || !edits.length) throw new Error("A change proposal requires at least one edit");
  if (edits.length > MAX_EDIT_FILES) throw new Error(`A change proposal is limited to ${MAX_EDIT_FILES} files`);
  const resolved = [];
  const seen = new Set();
  for (const edit of edits) {
    if (!edit || typeof edit !== "object") throw new Error("Each edit must be an object");
    if (typeof edit.content !== "string") throw new Error("Each edit requires string content");
    if (Buffer.byteLength(edit.content, "utf8") > MAX_EDIT_FILE_BYTES) {
      throw new Error(`Edit exceeds ${MAX_EDIT_FILE_BYTES} bytes: ${edit.path}`);
    }
    const target = resolveEditablePath(root, edit.path, { excludes, allow });
    if (seen.has(target.relative)) throw new Error(`Duplicate edit path: ${target.relative}`);
    seen.add(target.relative);
    resolved.push({ ...target, content: edit.content });
  }
  if (dryRun) {
    return { applied: resolved.map((item) => ({ path: item.relative, bytes: Buffer.byteLength(item.content, "utf8") })), dryRun: true };
  }
  const applied = [];
  for (const edit of resolved) {
    const existed = await readFileIfExists(edit.absolute);
    await atomicWrite(edit.absolute, edit.content, { fsync: true });
    applied.push({
      path: edit.relative,
      bytes: Buffer.byteLength(edit.content, "utf8"),
      sha256: sha256(edit.content),
      created: existed === null,
    });
  }
  return { applied, dryRun: false };
}

/**
 * Restores the workspace to a captured snapshot: new files are removed and changed
 * files are rewritten with their original bytes. Used when a repair attempt exhausts
 * its budget and the workspace must be left exactly as it was found.
 */
export async function restoreFromSnapshot(root, snapshot) {
  if (!snapshot?.contents) throw new Error("Snapshot was not captured with content");
  const current = await listWorkspaceFiles(root, { excludes: snapshot.excludes ?? DEFAULT_EXCLUDES });
  const restored = [];
  for (const relative of current) {
    if (!snapshot.contents.has(relative)) {
      const { rm } = await import("node:fs/promises");
      await rm(path.resolve(root, relative), { force: true });
      restored.push(relative);
    }
  }
  for (const [relative, content] of snapshot.contents) {
    const absolute = path.resolve(root, relative);
    let currentContent = null;
    try {
      currentContent = await readFile(absolute);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Bytes are compared, never decoded: a binary file must be restored exactly.
    if (currentContent && Buffer.compare(currentContent, content) === 0) continue;
    await atomicWrite(absolute, content, { fsync: true });
    restored.push(relative);
  }
  return restored.sort();
}
