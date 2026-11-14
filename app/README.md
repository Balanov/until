# UNTIL product site

The public page for UNTIL: a release-first product page for product teams. React + TypeScript + Vite, local fonts, Russian and English, responsive, static hosting, downloadable engine-generated fixtures.

## Run

```sh
npm ci --ignore-scripts
npm run dev -- --host 127.0.0.1 --port 7100
```

## Build and verify

```sh
npm run build
node scripts/validate.mjs
```

Validation uses the production build in a real Chrome/Edge browser. It checks the release-first hero, the six task-cycle stages, the visible test and proof counts, the four product-team value cards, the role table, the repair proof (the first attempt must show the real failing assertion, the second the green project test), the downloadable raw repair trace, the security claims and exclusions, the honest-limits cards, the release economics recomputation and reset, the start-here commands, both localizations, every in-page anchor, console/network errors and horizontal overflow at 375/768/1024/1440 px. It captures screenshots and stops its temporary server. Set `CHROME_BIN` to override the browser path. Reports are written under `../.until/site-check/` and are not release artifacts.

`public/proof.json`, `public/tests.json`, `public/benchmarks.json`, `public/comparison.json`, `public/live/*` and `public/fixtures/*.json` are generated from actual local runs by root scripts. `public/until-proof.zip` contains the raw responses, engine traces and SHA-256 manifest. Do not replace them with hand-written performance claims.

All public hosting assets are static. No account, backend, analytics, external font CDN or browser-side model call is used.
