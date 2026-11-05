# Contributing to UNTIL

Fork the repository, create a focused branch and keep the core's evidence and permission invariants intact. Small, inspectable changes are preferred over broad framework additions.

## Before a pull request

Use Node.js 24+ and run:

```sh
npm ci --ignore-scripts
npm run check
node scripts/test-report.mjs
npm run proof
npm run bench
npm ci --prefix app --ignore-scripts
npm run site:build
```

For user-facing site changes also run `npm run validate:site` and inspect the generated desktop and mobile screenshots. `CHROME_BIN` may point to Chrome or Edge.

## Required tests

Add regression coverage for every behavior change, especially:

- evidence type or provenance changes;
- role capability and authorization changes;
- retry, lease, crash recovery and stop behavior;
- external side effects and idempotency;
- model output validation and cost accounting;
- new acceptance checks or executor profiles;
- selection/held-out evaluation changes;
- multilingual, RTL, keyboard and mobile interactions.

Do not weaken a test to make a bug disappear. A green exit code is not sufficient proof; assert the authoritative state and absence of forbidden side effects.

## Design rules

- Keep the core free of mandatory runtime npm dependencies.
- Use deterministic code for predictable transitions and models only where they add measurable value.
- Never let a model grant itself permissions, budgets, checks, evals or release rights.
- Never count synthetic output as real demand or observed business impact.
- Unknown cost, evidence or outcome stays `null` / `unknown`, not a fabricated success.
- New external executors require an explicit sandbox boundary and bounded argv contracts.
- Preserve raw artifacts and reproducible methods for every published metric.

## Documentation and claims

Update README, architecture, security and machine-readable proof together. Separate measured facts, fixture mechanisms, vendor claims and future hypotheses. Do not publish “10×”, ROI, production readiness or team-replacement claims without a paired, reproducible evaluation on real tasks.

## License and conduct

Contributions are licensed under MIT. Keep third-party code and assets compatible and document them in `CREDITS.md`. Security reports follow `SECURITY.md`, not public issues. Be precise, respectful and evidence-led in reviews.
