import { performance } from "node:perf_hooks";
import { sha256 } from "./util.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_BYTES = 2_000_000;

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error(`Model response exceeds ${maxBytes} bytes`);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(`Model response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(merged);
}

export function parseModelJson(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Model returned an empty response");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Model response is not valid JSON");
  }
}

function assertEndpoint(baseURL, allowedOrigins) {
  const url = new URL(baseURL);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Model endpoint must use HTTP(S)");
  if (url.username || url.password) throw new Error("Credentials in model URL are forbidden");
  if (allowedOrigins?.length && !allowedOrigins.includes(url.origin)) {
    throw new Error(`Model endpoint is not allowlisted: ${url.origin}`);
  }
  return url;
}

export class OpenAICompatibleModel {
  constructor(config, { fetchImpl = fetch, maxBytes = DEFAULT_MAX_BYTES } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.maxBytes = maxBytes;
    this.baseURL = assertEndpoint(config.baseURL, config.allowedOrigins);
  }

  async complete({ system, input, maxTokens = 4096 }) {
    const controller = new AbortController();
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(new Error("Model request timeout")), timeoutMs);
    const headers = { "content-type": "application/json" };
    if (this.config.apiKeyEnv) {
      const key = process.env[this.config.apiKeyEnv];
      if (!key) throw new Error(`Missing model credential: ${this.config.apiKeyEnv}`);
      headers.authorization = `Bearer ${key}`;
    }
    const started = performance.now();
    try {
      const response = await this.fetch(`${this.baseURL.href.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: typeof input === "string" ? input : JSON.stringify(input) },
          ],
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      const raw = await readLimited(response, this.maxBytes);
      let payload;
      try { payload = JSON.parse(raw); } catch { throw new Error(`Provider returned non-JSON HTTP ${response.status}`); }
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${JSON.stringify(payload.error ?? payload).slice(0, 1000)}`);
      const choice = payload.choices?.[0];
      if (choice?.finish_reason === "length" || choice?.finish_reason === "max_tokens") {
        throw new Error("Model output was truncated");
      }
      const content = choice?.message?.content;
      if (typeof content !== "string") throw new Error("Provider response has no text content");
      const usage = payload.usage ?? {};
      const inputTokens = Number.isInteger(usage.prompt_tokens) ? usage.prompt_tokens : null;
      const outputTokens = Number.isInteger(usage.completion_tokens) ? usage.completion_tokens : null;
      const pricing = this.config.pricing;
      const cost = pricing && inputTokens != null && outputTokens != null
        ? (inputTokens * pricing.inputPerMillion + outputTokens * pricing.outputPerMillion) / 1_000_000
        : null;
      return {
        content,
        model: this.config.model,
        inputTokens,
        outputTokens,
        cost,
        latencyMs: Math.round(performance.now() - started),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export class ReplayModel {
  constructor(config) {
    this.config = config;
    this.calls = 0;
  }

  async complete({ kind, generation = 1 }) {
    const candidates = this.config.responses?.[kind];
    if (!Array.isArray(candidates) || !candidates.length) throw new Error(`No replay response for ${kind}`);
    const response = candidates[Math.min(Math.max(0, generation - 1), candidates.length - 1)];
    this.calls += 1;
    return {
      content: JSON.stringify(response),
      model: `replay:${this.config.model ?? "fixture"}`,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      latencyMs: 0,
    };
  }
}

export class ModelRouter {
  constructor({ store = null, roles = {}, fetchImpl = fetch } = {}) {
    this.store = store;
    this.fetch = fetchImpl;
    this.roles = new Map();
    for (const [role, config] of Object.entries(roles)) {
      if (!config || config.enabled === false) continue;
      const Model = config.type === "replay" ? ReplayModel : OpenAICompatibleModel;
      this.roles.set(role, new Model(config, { fetchImpl }));
    }
  }

  has(role) {
    return this.roles.has(role);
  }

  async complete({ role, taskId = null, kind, generation = 1, system, input, maxTokens }) {
    const model = this.roles.get(role);
    if (!model) throw new Error(`No model configured for role ${role}`);
    const result = await model.complete({ kind, generation, system, input, maxTokens });
    if (this.store) {
      this.store.addModelCall({
        taskId,
        role,
        model: result.model,
        promptHash: sha256(JSON.stringify({ system, input })),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost: result.cost,
        latencyMs: result.latencyMs,
      });
    }
    return { ...result, parsed: parseModelJson(result.content) };
  }
}
