import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, canonicalJson, resolveInside, sha256 } from "./util.js";

const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 20_000_000;

function publicPath(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace: ${candidate}`);
  }
  const segments = relative.split(path.sep);
  if ([".git", ".until"].includes(segments[0])) {
    throw new Error("Release paths must not include .git or .until");
  }
  return segments.join("/");
}

async function readManifest(workspace, relativePaths) {
  if (!Array.isArray(relativePaths) || relativePaths.length < 1 || relativePaths.length > MAX_FILES) {
    throw new Error(`goal.policy.releasePaths requires 1–${MAX_FILES} files`);
  }
  if (new Set(relativePaths).size !== relativePaths.length) throw new Error("Release paths must be unique");
  const root = await realpath(path.resolve(workspace));
  const files = [];
  let totalBytes = 0;
  for (const candidate of relativePaths) {
    if (typeof candidate !== "string") throw new Error("Release paths must be strings");
    const lexical = resolveInside(root, candidate);
    publicPath(root, lexical);
    const real = await realpath(lexical);
    const relative = publicPath(root, real);
    const info = await stat(real);
    if (!info.isFile()) throw new Error(`Release path is not a regular file: ${relative}`);
    const content = await readFile(real);
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Workspace release exceeds 20 MB");
    files.push({ path: relative, bytes: content.length, sha256: sha256(content), real, content });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const publicFiles = files.map(({ path: file, bytes, sha256: hash }) => ({ path: file, bytes, sha256: hash }));
  return {
    manifest: {
      format: "until-workspace-release/v1",
      files: publicFiles,
      totalBytes,
      hash: sha256(canonicalJson(publicFiles)),
    },
    contents: files,
  };
}

export async function readWorkspaceManifest(workspace, relativePaths) {
  return (await readManifest(workspace, relativePaths)).manifest;
}

async function writeVerified(file, content) {
  try {
    const existing = await readFile(file);
    if (sha256(existing) !== sha256(content)) throw new Error(`Release path already contains different content: ${file}`);
  } catch (error) {
    if (error.code === "ENOENT") await atomicWrite(file, content, { fsync: true });
    else throw error;
  }
}

export async function materializeWorkspaceRelease(workspace, releaseDirectory, expectedManifest) {
  if (!expectedManifest || expectedManifest.format !== "until-workspace-release/v1") {
    throw new Error("Invalid workspace release manifest");
  }
  const { manifest, contents } = await readManifest(workspace, expectedManifest.files.map((item) => item.path));
  if (manifest.hash !== expectedManifest.hash) {
    throw new Error("Workspace changed between acceptance and release publication");
  }
  const root = resolveInside(workspace, releaseDirectory);
  for (const item of contents) {
    const target = resolveInside(root, item.path);
    await writeVerified(target, item.content);
  }
  const manifestFile = resolveInside(root, "manifest.json");
  await writeVerified(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const displayPath = (file) => path.relative(path.resolve(workspace), file).split(path.sep).join("/");
  return {
    path: displayPath(root),
    manifestPath: displayPath(manifestFile),
    files: manifest.files.length,
    bytes: manifest.totalBytes,
    hash: manifest.hash,
  };
}
