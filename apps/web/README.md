# Inside Coding Agents Web

The public reading and research interface uses a Next.js-compatible App Router, React, TypeScript, vinext, and a Cloudflare Worker-compatible build.

## Data boundary

The website does not maintain a second fact database. `scripts/sync-content.mjs` reads the canonical curriculum, Agent profiles, Claims, Mechanisms, Experiments, Results, and Traces from the repository root.

Generated projections live under `app/data/` and `public/data/`. They are committed so a source snapshot can build independently, but they must be regenerated rather than edited by hand.

## Run locally

```bash
npm ci
npm run dev
```

The interface defaults to English, detects Chinese browser preferences, and supports an explicit English/中文 switch.

## GitHub Pages export

The public site is exported under the repository base path and contains no request-time server dependency:

```bash
npm run test:pages
```

The command writes the deployable site to `out/`, verifies every expected HTML route, and checks project-relative assets and Trace downloads. The pinned workflow in `.github/workflows/pages.yml` publishes that directory to GitHub Pages after a successful push to `main`.

## Validate

```bash
npm run audit:ci
npm run lint
npm run typecheck
npm test
```

`npm test` regenerates content, creates a production build, and renders every published route. The tests also verify graph relationships, bilingual search, navigation, and downloadable Trace artifacts.
