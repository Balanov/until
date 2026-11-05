# Credits and licenses

UNTIL's product name, U-with-verdict logo, proof-rail interface, translations, visual tokens and layout were created from scratch for this project. The visual design of EQUAL or other Balanov products was not copied.

## Runtime and site dependencies

- [React](https://react.dev/) — MIT.
- [Vite](https://vite.dev/) — MIT.
- [TypeScript](https://www.typescriptlang.org/) — Apache-2.0.
- [Lucide](https://lucide.dev/) — ISC.
- [Unbounded](https://fonts.google.com/specimen/Unbounded) and [IBM Plex Sans / Mono](https://github.com/IBM/plex) — SIL Open Font License, distributed locally through Fontsource packages.
- [Playwright Core](https://playwright.dev/) — Apache-2.0, browser verification only.

Dependency versions and integrity hashes are locked in `package-lock.json` and `app/package-lock.json`. Third-party licenses remain with their respective packages.

## Research and design inspirations

The implementation uses original code while applying publicly documented principles:

- [MetaGPT](https://github.com/geekan/MetaGPT) and [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) — explicit role artifacts and SOP discipline.
- [GitHub Spec Kit](https://github.com/github/spec-kit) — specification and acceptance contracts.
- [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview) and [Temporal](https://temporal.io/) — durable execution, retries and idempotency boundaries.
- [Gödel Agent](https://arxiv.org/abs/2410.04444) and [Darwin Gödel Machine](https://github.com/jennyzzt/dgm) — empirical self-improvement through candidate selection.
- [MAST](https://arxiv.org/abs/2503.13657) — multi-agent failure modes and independent verification.
- [Nielsen Norman Group: Synthetic Users](https://www.nngroup.com/articles/synthetic-users/) — limits of synthetic customer evidence.
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html) — execution-side authorization, least privilege and fail-closed behavior.
- [METR developer-productivity RCT](https://arxiv.org/abs/2507.09089) — measured outcomes rather than perceived productivity.

Balanov's own public projects informed ecosystem boundaries: Skein (epoch fencing), LATCH (quote/approve/commit/receipt and idempotency), Verdict (narrow advisory outcome classification), UNCUT and Shim (model-neutral execution), EQUAL (reproducible proof methodology), 2AOS Core (durable jobs and evidence-linked observations), BAIagent Director (evidence-linked pilot hypotheses). No code from the source-available 2AOS Core was copied into this MIT project.

See [market research](docs/market-research.md) for analysis, trade-offs and primary sources.
