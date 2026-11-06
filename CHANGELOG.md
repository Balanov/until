# Changelog

## Unreleased — 2026-11-06

Product-work repositioning and a repository-level proof.

- The site and README now lead with the owner’s outcome and six product-work stages: research, priority/spec, implementation, independent acceptance, release candidate and outcome observation.
- `goal.policy.releasePaths` packages explicitly allowed workspace files into a local release candidate with a SHA-256 manifest, path-containment checks, size limits and idempotent writes.
- A recorded repository cycle changes `src/activation.js`, moves the real Node regression test from `exit 1` to `exit 0` / `ACTIVATION_TEST_OK`, completes 6 role-separated tasks and 6 independent acceptance checks, and preserves two immutable candidate files after later workspace edits.
- The deterministic proof now contains **14/14 checks**; the complete suite contains **52/52 passing tests**.
- The expanded raw ZIP includes the repository cycle, deterministic proof and test report alongside all 48 real local-model trials.
- Production deployment remains a separate boundary. The new repository proof is deterministic control-plane evidence, not an LLM-quality or business-ROI benchmark.

## 0.2.0 — 2026-11-05

Measured hardening and a proof-first executive/engineering site.

- Owner-supplied `goal.policy.acceptance` is merged into every contract and cannot be discarded by the model. Live model contracts without external acceptance now fail closed.
- Strict role-specific JSON Schemas are sent to compatible providers; `structuredOutputs: false` remains available per model or globally.
- Opt-in raw response tracing, role/model economics and `until export --output FILE` expose model calls, verdicts, releases, events and integrity hashes. Raw content can be sensitive and is disabled by default.
- A frozen same-model protocol published all 48 selection/held-out trials. Held-out UNTIL acceptance moved from **0/6 to 6/6**. The current direct arm also accepted **6/6** and was **3.281× faster**, using one model call instead of three. This is a bounded JSON-deliverable test, not a competitor or business-outcome benchmark.
- A downloadable raw bundle includes 102 files and a SHA-256 manifest; an integrity test checks all trials, responses and accepted release receipts.
- The six-language RTL site now leads with real held-out evidence, live GitHub stars/forks, sourced capability comparisons, explicit product gaps and an assumption-based pilot calculator.
- **50 unit/integration/integrity tests**, 10 deterministic proof checks and production browser validation.

Known boundaries remain: no native Git/PR delivery or managed sandbox, no production deployment, no universal team-replacement claim, no external effect without a configured risk boundary, and no business ROI claim without paired real-task pilots.

## 0.1.0 — 2026-11-05

Initial engineering MVP.

- Durable SQLite goals, typed signals, opportunities, tasks, artifacts, verdicts, release candidates, outbox and hash-chain audit.
- Persistent epoch stop, late-completion rejection, lease recovery, retries, dead-letter and idempotent actions.
- Role capabilities and independent acceptance checks with realpath and high-risk blocking.
- Real-evidence gate with synthetic-only research fallback and post-release outcome observation.
- OpenAI-compatible and replay model adapters with per-role routing and cost records.
- Selection/held-out strategy evolution with safety regression rejection and lineage.
- Cross-platform CLI, deterministic full-cycle demo and raw proof/benchmark generators.
- Original multilingual React manifesto in six languages with RTL and actual local-trace replay.
- 43 unit/integration tests, 10 independent proof checks and production browser validation at four widths.
- MIT license, security and contribution guidance, citation metadata and cross-platform CI.

Known boundaries: no production deployment, no universal team-replacement claim, no own foundation model, no external effect without a separately configured risk boundary, and no business ROI claim without paired real-task pilots.
