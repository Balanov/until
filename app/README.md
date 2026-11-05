# UNTIL manifesto and proof replay

Original multilingual site for UNTIL. React + TypeScript + Vite, local fonts, six languages, RTL, responsive proof rail and downloadable engine-generated fixtures.

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

Validation uses the production build in a real Chrome/Edge browser, selects actual held-out trials, downloads raw traces and the complete proof bundle, checks the comparison and scenario calculator, copies quick-start commands, exercises all languages and RTL, and checks console/network errors and horizontal overflow at 375/768/1024/1440 px. It captures screenshots and stops its temporary server. Set `CHROME_BIN` to override the browser path. Reports are written under `../.until/site-check/` and are not release artifacts.

`public/proof.json`, `public/tests.json`, `public/benchmarks.json`, `public/comparison.json`, `public/live/*` and `public/fixtures/*.json` are generated from actual local runs by root scripts. `public/until-proof.zip` contains the raw responses, engine traces and SHA-256 manifest. Do not replace them with hand-written performance claims.

All public hosting assets are static. No account, backend, analytics, external font CDN or browser-side model call is used.
