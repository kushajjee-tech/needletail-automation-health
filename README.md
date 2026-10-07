# Automation health — a concept for Needletail AI

A C-suite dashboard showing where Needletail's insurance-verification AI gets stuck and a human has to step in. A CEO can read the status in seconds, then dig into any insurer or issue.

> **Synthetic data.** Every number, insurer behaviour, customer and case is made up for this prototype. The split between portal AI, voice AI and human follows the shape of Needletail's public Q1 2026 figures (about 14% of verifications need a fallback path). Not affiliated with or endorsed by Needletail AI.

**Live demo:** _add your GitHub Pages link here after the first deploy_

## What's inside

| Level | Screen | Answers |
| --- | --- | --- |
| 1 | **Overview** | Is automation getting better or worse? What needs attention this month? |
| 2 | **Insurers** | Which insurers send the most work to humans, and why? |
| 2 | **Issues** | Which recurring issues cause the most human cases, ranked by what one fix could address? |
| 3 | **Insurer detail** | What drives manual work at this insurer; portals, customers and 3-month trend. |
| 3 | **Issue detail** | Where it is concentrated, the exact steps where the AI gets stuck, a suggested fix, weekly trend, example cases. |

A built-in **Take the tour** walkthrough explains the dashboard in seven steps.

### How the numbers work

- **Human cases** are the main unit everywhere.
- **Human hours** = the time logged on each human case, from pickup to close, added up.
- **Ranking** = human cases × the share of those cases that fail in exactly the same way (one fix is likely to address them).
- **Insurer health** (illustrative thresholds): under 6% needing a human is healthy, 6–9% watch, 9% or more (or human cases up 50%+) needs attention.

## Run it locally

Requires Node 18 or newer. No dependencies to install.

```bash
npm test        # data-model checks
npm start       # builds dist/index.html and serves it at http://localhost:4173
```

Or run `npm run build` and open `dist/index.html` directly in a browser.

## Deploy

Pushing to `main` runs the tests, builds the page and publishes it to GitHub Pages (`.github/workflows/deploy.yml`). One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The output is a single self-contained HTML file, so it can also be hosted on Netlify, Vercel or any static host.

## Project structure

```
src/
  index.template.html   page shell, meta tags, favicon
  styles.css            all styles
  model.js              synthetic data generator (seeded, deterministic) and aggregations
  app.js                screens, navigation, tour
scripts/
  build.mjs             inlines everything into dist/index.html
  serve.mjs             local preview server
tests/
  model.test.mjs        totals reconcile, demo scenario holds, no invalid numbers
.github/workflows/
  deploy.yml            test, build and deploy to GitHub Pages
```
