<div align="center">
  <img src="app/public/logo.svg" alt="UNTIL logo" width="112">
  <h1>UNTIL</h1>
  <p><strong>Done means proven.</strong></p>
  <p>Evidence-gated autonomous product operations.<br>Local-first. Model-neutral. MIT.</p>
  <p><a href="https://balanov.pro/until/">Manifesto and interactive proof</a> · <a href="README_RU.md">Русское введение</a></p>
</div>

[![CI](https://github.com/Balanov/until/actions/workflows/ci.yml/badge.svg)](https://github.com/Balanov/until/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-blue.svg)](package.json)

UNTIL is an open autonomous product framework for owners, CEOs and CPOs who want product work to move without manually coordinating every role. You set the business outcome, metric, budget and risk limits. UNTIL turns real customer or product signals into research, the next priority, a bounded specification, implementation, independent acceptance, a verified local release candidate and the next outcome-driven cycle.

**Owner’s goal → research → priority & spec → implementation → independent test → release candidate → observed outcome → next work.**

A finished LLM answer is never accepted as proof of finished product work. The builder cannot accept its own work, and the system cannot rewrite the owner’s goal, grant itself rights or invent missing evidence.

> **Engineering MVP 0.2.** The published proof now includes an actual repository change with a failing-before/passing-after Node test and an immutable two-file release candidate. It proves the control plane and a measured improvement on bounded JSON deliverables—not universal team replacement, arbitrary LLM quality, production deployment or business ROI. Start with low-risk, authoritatively verifiable digital-product tasks.

## What moves without manual coordination

- **Research:** observed incidents, interviews and product signals stay linked to the opportunity they support.
- **Priority and specification:** an open outcome creates the next bounded contract with owner-locked acceptance checks.
- **Implementation:** a deterministic executor or separately sandboxed coding agent receives the contract; nobody needs to chase a status meeting.
- **Independent acceptance:** another role executes authoritative checks, including a real repository test.
- **Delivery:** accepted files become a content-hashed local release candidate, not an unexamined production deployment.
- **Follow-through:** a post-release observation closes the outcome or creates the next cycle.

## Why another agent framework?

Role-playing teams, PM copilots, coding agents, research moderators and software factories already exist. UNTIL is the neutral outer loop between them:

- **Self-directed work:** open outcome deficits generate tasks; agents do not wait for a new prompt after every answer.
- **Durable execution:** SQLite WAL, leases, retry/backoff, dead-letter, dependencies and crash recovery.
- **Fail-closed stop:** a persistent epoch rejects late completions before they can release dependent work.
- **Evidence gate:** synthetic personas can improve research, but cannot unlock delivery.
- **Role capabilities:** builders never verify themselves; agents cannot grant themselves rights, budgets or evals.
- **Independent acceptance:** file, hash, JSON, content and registered command checks instead of “trust me”.
- **Idempotent delivery:** verified artifacts become local release candidates with content-hash receipts and an outbox.
- **Bounded evolution:** strategy candidates face selection and separate held-out fixtures, safety checks and lineage.
- **Model neutrality:** hosted or local OpenAI-compatible endpoints per role; zero-cost replay fixtures for CI.
- **Honest proof:** raw traces, test reports, benchmarks, limitations and reproducible commands are published with the product.

Read the [market analysis](docs/market-research.md) and [architecture](docs/architecture.md).

## Quick start

Requirements: **Node.js 24+**. The core has **zero runtime npm dependencies** and needs no account, telemetry, model key or network for its deterministic proof.

```sh
git clone https://github.com/Balanov/until.git
cd until
npm ci --ignore-scripts
npm test
npm run proof
node bin/until.mjs demo
```

`demo` runs an explicitly marked deterministic fixture: six role-separated tasks from a real interview fixture to a verified local release candidate, followed by a metric observation and `achieved`. It also evaluates a strategy on held-out fixtures. This proves the loop, not model intelligence.

### Run a goal yourself

```sh
node bin/until.mjs init --goal examples/goal.json
node bin/until.mjs signal add examples/interview.json
node bin/until.mjs run --cycles 8
node bin/until.mjs status
node bin/until.mjs audit
```

State, artifacts and local release candidates live under `.until/` in the selected workspace. The default workspace is the current directory; choose another with `--workspace DIR` or a different database with `--state FILE`.

Add a post-release observation and run again:

```sh
node bin/until.mjs signal add examples/metric.json
node bin/until.mjs run --cycles 2
```

Try the evidence boundary instead:

```sh
node bin/until.mjs signal add examples/synthetic.json
node bin/until.mjs run --cycles 8
```

A synthetic-only goal produces an interview guide and `waiting_evidence`, not a delivery task.

### Keep the outer loop running

```sh
node bin/until.mjs start
# in another process
node bin/until.mjs stop
node bin/until.mjs reset
```

`start` keeps observing and working without burning tokens while idle. `stop` advances the persistent epoch and rejects late work. `reset` clears the stop latch but never reuses an epoch. Task, model-call and cost budgets are available through `--tasks`, `--model-calls` and `--max-cost`.

## Connect a model

Copy `until.config.example.json` to `until.config.json` and configure models that are actually available. Ollama, LM Studio, llama.cpp and hosted OpenAI-compatible APIs use the same boundary.

```json
{
  "models": {
    "researcher": {
      "type": "openai-compatible",
      "baseURL": "http://127.0.0.1:11434/v1",
      "allowedOrigins": ["http://127.0.0.1:11434"],
      "model": "qwen3:8b",
      "timeoutMs": 120000
    }
  }
}
```

For a hosted provider add `apiKeyEnv` and an optional price card. The **name** of the environment variable is stored in config; the secret is read only from the environment and is never written to SQLite, traces or proof bundles. Unknown cost is `null`, not a fake zero.

Model output is validated against strict role-specific JSON Schemas and existing evidence IDs. Compatible providers receive `response_format: json_schema`; set `structuredOutputs: false` globally or on one model if the endpoint does not support it. External text, tool output and repository content are untrusted data, never authorization. Roles without a configured model use the explicit deterministic fixture implementation.

For a live model delivery, supply authoritative acceptance in the goal. The owner agent may add constraints but cannot discard them; without these checks a live contract stops instead of inventing its own definition of done:

```json
{
  "policy": {
    "acceptance": [
      { "type": "json_field", "field": "implementation.feature", "equals": "preview-import-errors" }
    ]
  }
}
```

`traceResponses: true` opts into storing raw model content for export. Treat it as sensitive: review traces before sharing them. Export a proof bundle with `node bin/until.mjs export --output proof.json`; it includes tasks, verdicts, receipts, events, available model responses and integrity hashes. No secrets are intentionally exported.

## Execution boundary

The built-in executor creates only bounded experiment artifacts inside `.until/artifacts/`. It does not deploy production code.

An external coding harness can be registered as an argv profile with no shell interpolation. It runs only with `sandboxConfirmed: true` in a separately configured OS, VM or container sandbox. The builder receives a contract on stdin and returns bounded JSON. It cannot verify itself, publish, change the goal or execute arbitrary model-authored command profiles.

High-risk contracts stop with `blocked_risk` unless a separate risk boundary is deliberately implemented. Production deployment, payments, outreach and IAM changes are outside the default release path.

See [SECURITY.md](SECURITY.md).

## Evidence types

| Signal | Can create | Cannot prove alone |
|---|---|---|
| Real interview / support / incident | Research and a bounded experiment | Market size or profitability |
| Product metric / payment | Baseline and observed outcome | Causality without an experiment design |
| Reported / public source | A sourced market hypothesis | Your own customer demand |
| Inferred model output | A hypothesis to investigate | Observed evidence |
| Synthetic persona | Research-guide and assumption testing | Delivery or release approval |

## What the current proof says

- **52 / 52** unit, integration and published-evidence integrity tests pass.
- **14 / 14** independent deterministic proof checks pass.
- One real-signal fixture cycle completes **6** role-separated tasks and a later outcome observation.
- A separate repository cycle completes **6/6** role-separated tasks and **6/6** acceptance checks. Its real Node regression test moves from **exit 1** before the fix to **exit 0 / ACTIVATION_TEST_OK** after it. Two accepted files are preserved in an immutable local release candidate; later workspace edits do not alter them. [Raw repository cycle](app/public/fixtures/repository-run.json).
- Late completion after stop is rejected; expired leases recover; duplicate actions are deduplicated.
- The evolver example moves from **0/3 to 3/3 correct held-out fixture rankings**, with no synthetic selection. This is a fixture mechanism check, not real-world improvement.

### Real model comparison

A frozen protocol ran `qwen3:8b` locally on two selection tasks and two held-out tasks, three times per task and arm. Both arms received the same observation, required feature and acceptance checks. Every run is included.

| Held-out, 6 runs per arm | Accepted | Median wall time | Model calls |
|---|---:|---:|---:|
| UNTIL 0.1 | 0/6 | 9.589 s | 1.5 |
| UNTIL 0.2 | 6/6 | 14.105 s | 3 |
| Direct 0.1 | 1/6 | 3.910 s | 1 |
| Direct 0.2 | 6/6 | 4.299 s | 1 |

The current direct arm is **3.281× faster** than UNTIL and also accepts 6/6. Both current arms received strict JSON Schemas, so the improvement is not attributable to the outer loop alone. UNTIL's added value is durable state, role separation, owner-locked acceptance, independent verification, receipts and the outer outcome loop—not faster one-shot JSON generation.

These are bounded structured-deliverable fixtures, not production code, new customer interviews, a competitor ranking, a business outcome or a team-replacement study. Local provider charges exclude hardware and electricity.

Raw files: [comparison](app/public/comparison.json), [protocol](benchmarks/live-protocol.json), [tasks](benchmarks/live-tasks.json), [48 raw traces](app/public/live/), [raw bundle](app/public/until-proof.zip), [tests](app/public/tests.json), [proof](app/public/proof.json), [benchmarks](app/public/benchmarks.json). Capability sources and comparison limits are in the [market analysis](docs/market-research.md).

Regenerate deterministic checks and package the recorded comparison:

```sh
npm run check
node scripts/test-report.mjs
npm run proof
npm run bench
npm run proof:package
```

To run a new live comparison, use a fresh label and the same local Ollama model; do not overwrite the published historical baseline:

```sh
npm run compare -- --label my-run --system until --suite heldout --repeat 3
npm run compare -- --label my-run --system direct --suite heldout --repeat 3
```

`npm run compare:report` regenerates the published report from the two historical labels. Intrinsic queue/startup measurements are local observations, not competitor rankings or business outcomes. See [BENCHMARKS.md](BENCHMARKS.md).

## Multilingual manifesto

The site is available in English, Russian, Spanish, Chinese, Hindi and Arabic, including RTL. It replays the actual engine traces above; it does not pretend to call a model in the browser.

```sh
npm ci --prefix app --ignore-scripts
npm run site:build
npm run site:dev -- --host 127.0.0.1 --port 7100
```

Production browser verification (Chrome or Edge):

```sh
npm run validate:site
```

It selects real held-out traces, checks raw trace/bundle downloads, the sourced comparison, scenario calculator, clipboard, all six languages, RTL and 375/768/1024/1440 layouts, console errors and failed requests, then stops its temporary server. `CHROME_BIN` can point to a custom browser executable. Repackaging the raw ZIP uses Python 3 through `npm run proof:package`; the core and deterministic tests need only Node.js.

## Repository map

```text
bin/                 CLI
src/                 SQLite kernel, policy, agents, checks, model router, evolver
test/                Unit, integration and adversarial tests
benchmarks/          Frozen selection and held-out fixtures
scripts/             Syntax, proof, benchmark and report generators
app/                 React + TypeScript manifesto and honest trace replay
app/public/          Machine-readable proof and raw measurements
examples/            Goal, real interview, metric and synthetic inputs
docs/                Market analysis and architecture
.github/workflows/   Linux, Windows and macOS CI
```

## Roadmap boundaries

Next useful work is connector conformance, real interview/metric ingestion, sandboxed coding-agent adapters, Temporal/LangGraph execution bridges, richer outcome experiments and paired pilots on real repositories. Self-modifying source code remains a separate research lane with an archive, held-out harness and sandbox—not a hidden production permission.

No own foundation model is planned until traces and held-out evidence show that a specialized model is the actual bottleneck.

## License and citation

MIT. Fork it, modify it, ship it. See [LICENSE](LICENSE), [CITATION.cff](CITATION.cff), [CREDITS.md](CREDITS.md) and [CHANGELOG.md](CHANGELOG.md).
