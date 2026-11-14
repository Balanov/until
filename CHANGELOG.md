# Changelog

## Unreleased

## 0.3.0 — 2026-11-14

The executor can now change code and repair it against the project's own failing check.

### Added

- **`src/executor/workspace.js`** — content-hashed workspace snapshots, atomic and allowlisted edits, manifest diffing and a byte-for-byte restore.
- **`src/executor/repair.js`** — the test-driven repair loop: propose → apply → run the authoritative check → feed the failure back → retry, bounded by `goal.policy.build.maxAttempts`. On exhaustion the workspace is restored exactly. A change outside `goal.policy.build.allowedPaths` is rejected and rolled back as `out_of_scope_edit`.
- **Builder protocol `until-builder/v2`** — a harness returns `{ edits: [{ path, content }] }` and the engine applies them, so the same harness can be re-run with the failed check as feedback. The v1 protocol keeps working and is adapted through workspace diffing.
- **`until init --from-repo DIR`** — detects how a repository proves itself (`node --test`, `npm test`, `python -m pytest`, `cargo test`, `go test ./...`, `mvn test`, `gradle test`, `make test`) and writes a ready goal whose acceptance gate is the project's own test command, plus the matching check profile.
- **`until import --file FILE --goal ID`** — ingests evidence from CSV, JSON and JSONL exports. Fail-closed: without `--consent` a record is stored with `consent = 0` and can never unlock delivery or a release.
- **`until doctor [--online]`** — eleven checks over the runtime, workspace, database, event hash chain, dead-letter, expired leases, pending outbox, goal metrics, blocked goals and signal consent.
- **`until replay TASK_ID`** — returns a dead-lettered task to the queue while preserving its idempotency key.
- **`expect.exitCode` acceptance expectation** — a project's own test suite can be the acceptance gate. Expectations are validated before use.
- **`goal.policy.maxRevisions`** — bounds rework. A goal that cannot satisfy its checks stops as `blocked_rework` instead of silently consuming the task budget.
- **CI security**: `npm audit` for runtime and site dependencies, CodeQL `security-and-quality`, a published CycloneDX SBOM, and `dependency-review` on pull requests.
- **The suite now contains 97/97 passing tests** (was 52/52) and the deterministic proof contains 17/17 checks (was 14/14).
- The site and README now lead with the owner’s outcome and six product-work stages: research, priority/spec, implementation, independent acceptance, release candidate and outcome observation.
- `goal.policy.releasePaths` packages explicitly allowed workspace files into a local release candidate with a SHA-256 manifest, path-containment checks, size limits and idempotent writes.
- A recorded repository cycle changes `src/activation.js`, moves the real Node regression test from `exit 1` to `exit 0` / `ACTIVATION_TEST_OK`, completes 6 role-separated tasks and 6 independent acceptance checks, and preserves two immutable candidate files after later workspace edits.
- Production deployment remains a separate boundary. The new repository proof is deterministic control-plane evidence, not an LLM-quality or business-ROI benchmark.
- **`docs/audit/`** — technical audit, positioning and messaging kit, rebuild roadmap, market landscape, hh.ru go-to-market analysis and three hh.ru-compliant vacancy drafts.

### Fixed: defects found by running a real agent on the real code

A local tool-using agent was pointed at a copy of this repository with a real failing regression test, through the real kernel. It found defects that no unit test could see, because they live on the seam between the model and the kernel.

- **A rollback corrupted binary files.** `snapshotWorkspace` read file contents as UTF-8 text and hashed that string, so a PNG hashed differently from its real bytes, and `restoreFromSnapshot` wrote the mangled text back. A 14-byte PNG became 26 bytes of garbage after a failed repair. Snapshots now store and hash bytes; the restore writes bytes. Covered by `test/executor-binary.test.mjs`.
- **Onboarding generated a check that did not work.** The test command was detected with a regular expression that discarded everything after `--test`, so this repository got `node --test` — which picks up `scripts/test-report.mjs` and fails. `parseNodeInvocation` now keeps the project's whole argument vector and hands shell-dependent scripts to the package manager.
- **The repair loop gave up after one attempt.** A builder that returned an empty edit list was treated as a decline, so it never received the failed check output on a second try — the exact feedback the loop exists to provide. Only an explicit decline stops the loop now.
- **The owner's policy was inert.** `goal.policy.autonomy` and `goal.policy.maxAttempts` were documented but never read, and there was no way to authorise a risk level, so a model that correctly classified a contract as high risk blocked all work. `maxRisk` was added, `autonomy: "observe"` stops the flow at the proposal, and `maxAttempts` sets the task budget.
- **The contract handed to the builder could be a placeholder.** Without a model on the owner role the spec summary was boilerplate with no requirement in it. The model-facing hint was also renamed from `required` to `responseShape`, because models copy that key into their answer and the local schema validation rightly rejected it.
- **A rejected model answer was never shown back to the model.** The kernel validated the answer, dropped it and asked the same question again; a model with a fixed schema habit lost every attempt identically. The rejection reason now travels with the next attempt, so the attempt becomes a correction.
- **A scheduled retry was dropped.** A failed task was re-queued 100 ms into the future, and the worker stopped as soon as nothing was ready *right now* — the retry budget the operator granted was never actually spent. The worker now waits for the scheduled task instead of closing the run.

### Added

- **`scripts/agent/ollama-builder.mjs`** — a reference coding agent that speaks `until-builder/v2`: it reads files, runs the operator-registered acceptance check, edits the workspace and retries, over a local Ollama model.
- **`scripts/agent/run-agent-proof.mjs`** — runs that agent against this repository through the real kernel and publishes the trace to `app/public/fixtures/agent-run.json`. `npm run agent`.
- **`scripts/agent/smoke-models.mjs`** — asks each local model one question with the agent's own prompt and schema and reports whether it can answer at all. `npm run agent:smoke`.
- **`scripts/agent/sweep-models.mjs`** — runs the full proof over several local models in a row and writes a summary table. `npm run agent:sweep -- --models a,b,c`.
- **Any GGUF can be used without conversion.** `ollama create <name> -f Modelfile` over the LM Studio library: the agent speaks Ollama's `/api/chat` with a JSON schema, which is llama.cpp grammar, not a vendor API.
- **The builder now receives the acceptance command** in its contract, so it can run the same check the independent verifier will run and see its own failure.
- **The builder now receives the failure, not the whole log.** `summarizeFailures` condenses a test run to what actually failed — 27 characters instead of 6 644 on this repository. The raw log stays in the evidence.
- **Command output is no longer truncated from the head** (`tailOutput`), and a chatty command is no longer killed for producing too much output.
- **The reference agent can discover files.** `list_files` and `grep` were added after the first run showed an agent guessing non-existent file names and burning its whole budget.
- **The reference agent patches rather than rewrites.** `patch_file` replaces one snippet, matching exactly, then by normalized whitespace, then by line. Rewriting a 8.7 KB file as JSON output is minutes of generation; a targeted replacement is hundreds of tokens.
- **`docs/agent.md`** — the protocol, the boundaries and how to reproduce the run.

### The product page was rebuilt

The site is no longer a manifesto that replays recorded traces. It is now a release-first product page for product teams:

- **New first screen.** "Your backlog reaches an accepted release" instead of "product work without managing the team by hand". The call to action is a pilot, not a local run.
- **New "value for a product team" section.** Four concrete mechanisms and a role table that states what the system does *and* what stays with the human — including that integrations are not built yet.
- **New repair proof.** The page now shows a real engine run of the repair loop: the first attempt with the actual failing Node assertion, the second with the green test. The per-attempt trail is published in `app/public/fixtures/repair-run.json` and included in the proof bundle.
- **New security section.** Zero runtime dependencies, running inside your perimeter, allowlisted edits, fail-closed with a hash-chained audit — and an explicit list of what is *not* inside the perimeter.
- **Honest limits replace the competitor matrix.** What the system deliberately does not do is stated plainly.
- **Economics of one accepted release** replaces the headcount-savings calculator.
- **English and Russian.** Four other languages were dropped: the founder's time is better spent on pilots than on translations before the first paying customer.
- The browser validator was rewritten against the new structure and checks the repair proof, the role table, the security claims, the economics recomputation, both localizations and overflow at 375/768/1024/1440 px.

### Fixed

- **The JSON Schema generator produced a defective schema for nested acceptance paths.** `required` was accumulated on the child object instead of the declaring parent, so a check on `implementation.repositoryChange` produced a schema requiring `implementation` inside `implementation`. This is the schema that was sent to the provider during the published 48-run comparison. The provider ignored it and acceptance was computed from parsed content, so the published accepted/rejected counts stand, but the "strict JSON Schema" claim was overstated. Fixed, with a regression test that a nested path never requires itself.
- **Role schemas now match their normalizers.** `score` and `risk` were listed as required although the normalizers default them; `researchSchema` produced an unsatisfiable `evidenceIds` schema when a goal had no signals.
- **Model output is validated locally against the role schema** before it reaches an agent. A provider that ignores `response_format` can no longer pass an out-of-schema contract into the kernel.
- **Windows command profiles** ending in `.cmd`/`.bat` can now be registered, routed through `cmd.exe` only when the whole command line passes a conservative character allowlist.

### Changed

- The suite contains **82/82 passing tests** (was 52/52). The deterministic proof still contains 14/14 checks.
- README, README_RU and SECURITY.md document the executor boundary, both builder protocols, the repair loop and the corrected benchmark claim.

Known boundaries remain: no native Git/PR delivery or managed sandbox, no production deployment, no connector ingestion, no universal team-replacement claim, no external effect without a configured risk boundary, and no business ROI claim without paired real-task pilots. The evolver still does not rank production opportunities.

## Unreleased — 2026-11-06

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
