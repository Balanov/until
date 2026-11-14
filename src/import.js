import { readFile } from "node:fs/promises";
import path from "node:path";
import { SIGNAL_KINDS } from "./policy.js";
import { safeNumber } from "./util.js";

/**
 * Evidence ingestion.
 *
 * Real evidence has to arrive from somewhere: a support export, an analytics dump,
 * a CRM pull, interview notes. This module turns those files into typed signals
 * without weakening the evidence gate.
 *
 * Fail-closed rule: a record only becomes "real" evidence when the operator
 * explicitly asserts participant consent. Without that assertion the signal is
 * stored with `consent = 0`, so it can produce a hypothesis but can never unlock
 * delivery or a release.
 */

const CONTENT_FIELDS = ["content", "body", "text", "message", "description", "comment", "summary"];
const SOURCE_FIELDS = ["source", "origin", "channel", "author", "sender"];
const VALUE_FIELDS = ["value", "metric", "number", "amount", "count"];
const UNIT_FIELDS = ["unit", "metric_unit", "measure"];
const TIME_FIELDS = ["observedAt", "observed_at", "timestamp", "date", "created_at", "createdAt"];
const ID_FIELDS = ["id", "signal_id", "ticket_id", "external_id"];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const source = text.replace(/^\uFEFF/, "");
  while (i < source.length) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += char; i += 1; continue;
    }
    if (char === '"' && field === "") { quoted = true; i += 1; continue; }
    if (char === ",") { row.push(field); field = ""; i += 1; continue; }
    if (char === "\r") { i += 1; continue; }
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += char; i += 1;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell.trim() !== ""));
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name.trim(), cells[index] ?? ""])));
}

function detectFormat(text) {
  if (text.startsWith("[")) return "json";
  try {
    JSON.parse(text);
    return "json";
  } catch { /* not a single JSON document */ }
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length > 1 && lines.every((line) => line.trim().startsWith("{"))) return "jsonl";
  if (lines.length > 1 && lines[0].includes(",")) return "csv";
  return "json";
}

export function parseRecords(text, format = "auto") {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const resolved = format !== "auto" ? format : detectFormat(trimmed);
  if (resolved === "csv") return parseCsv(trimmed);
  if (resolved === "jsonl" || resolved === "ndjson") {
    return trimmed.split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function pick(record, fields) {
  for (const field of fields) {
    const key = Object.keys(record).find((name) => name.toLowerCase() === field.toLowerCase());
    if (key !== undefined && record[key] !== null && String(record[key]).trim() !== "") return record[key];
  }
  return null;
}

export function mapRecordToSignal(record, { goalId, kind = null, source = null, consent = false } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Each imported record must be an object");
  }
  const content = pick(record, CONTENT_FIELDS);
  if (content === null) throw new Error("Record has no recognizable content field");
  const recordKind = pick(record, ["kind", "type", "signal_kind"]);
  const resolvedKind = kind ?? recordKind;
  if (!resolvedKind || !SIGNAL_KINDS.includes(resolvedKind)) {
    throw new Error(`Record kind is missing or unsupported: ${resolvedKind ?? "none"}`);
  }
  const recordSource = pick(record, SOURCE_FIELDS) ?? source;
  if (!recordSource) throw new Error("Record has no source; pass --source or provide a source column");
  const rawValue = pick(record, VALUE_FIELDS);
  const value = rawValue === null ? null : safeNumber(rawValue, "signal.value");
  const unit = pick(record, UNIT_FIELDS);
  const observedAt = pick(record, TIME_FIELDS);
  const id = pick(record, ID_FIELDS);
  const recordConsent = pick(record, ["consent", "has_consent", "participant_consent"]);
  const explicitConsent = consent === true
    || recordConsent === true
    || recordConsent === "true"
    || recordConsent === "1"
    || recordConsent === 1;
  return {
    goalId,
    kind: resolvedKind,
    source: String(recordSource).slice(0, 4096),
    content: String(content).slice(0, 1_000_000),
    value,
    unit: unit === null ? null : String(unit).slice(0, 100),
    observedAt: observedAt === null ? undefined : String(observedAt),
    consent: explicitConsent,
    ...(id === null ? {} : { id: String(id).slice(0, 200) }),
  };
}

export async function importSignals(store, {
  file,
  format = "auto",
  kind = null,
  source = null,
  goalId,
  consent = false,
  dryRun = false,
} = {}) {
  if (!goalId) throw new Error("An import requires a goal id");
  if (!store.getGoal(goalId)) throw new Error(`Goal not found: ${goalId}`);
  const absolute = path.resolve(file);
  const text = await readFile(absolute, "utf8");
  let records;
  try {
    records = parseRecords(text, format);
  } catch (error) {
    throw new Error(`Cannot parse ${absolute}: ${error.message}`);
  }
  if (!records.length) throw new Error(`No records found in ${absolute}`);
  const prepared = records.map((record, index) => {
    try {
      return mapRecordToSignal(record, { goalId, kind, source, consent });
    } catch (error) {
      throw new Error(`Record ${index + 1}: ${error.message}`);
    }
  });
  const summary = {
    file: absolute,
    format,
    records: prepared.length,
    withConsent: prepared.filter((item) => item.consent === true).length,
    withoutConsent: prepared.filter((item) => item.consent !== true).length,
    imported: [],
    skipped: [],
    dryRun,
  };
  if (dryRun) return summary;
  for (const signal of prepared) {
    // Re-running an import must not duplicate evidence: the external id is the key.
    if (signal.id && store.getSignal(signal.id)) {
      summary.skipped.push({ id: signal.id, reason: "already_present" });
      continue;
    }
    const stored = store.addSignal(signal);
    summary.imported.push({ id: stored.id, kind: stored.kind, consent: stored.consent, source: stored.source });
  }
  return summary;
}
