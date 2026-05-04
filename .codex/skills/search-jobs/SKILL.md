---
name: search-jobs
description: Deterministically search supported job sources for public Node-family backend JD research and store SQLite plus Markdown results.
---

# search-jobs

Use when the user invokes `$search-jobs` or asks to run the Codex job-search workflow for Wanted or Remember.

## User UX

Default:

```text
$search-jobs
```

Equivalent intent:

- default source: Wanted
- Node-family backend research profile
- default named query: `node_backend_public_demo`
- detail API collection enabled
- backend cheap filter
- SQLite DB: `data/headhunter.db`
- Markdown report: `results/search-jobs/<run-id>-wanted.md`

Supported overrides:

```text
$search-jobs wanted --query node_backend_public_demo
$search-jobs wanted --url "https://www.wanted.co.kr/wdlist/518/895?country=kr&job_sort=job.popularity_order&years=5&years=10&employment_types=job.employment_type.regular&locations=all"
$search-jobs remember --query node_backend_remember
```

Remember mode is detail-first and keeps only listings whose title/detail/body has a Node-family positive signal such as `node`, `nest`, or `typescript`.

## Internal command

Run the deterministic repo-local CLI/module:

```bash
pnpm search-jobs
pnpm search-jobs -- wanted --query node_backend_public_demo
pnpm search-jobs -- remember --query node_backend_remember
```

Dry-run the collection plan without fetching:

```bash
pnpm search-jobs -- --dry-run-plan
```

## Rules

- Prefer deterministic repo-local CLI/module execution over browser scraping.
- Do not use Playwright as the default path.
- Do not bypass CAPTCHA, authwall, MFA, OAuth/risk prompts, Cloudflare, rate limits, or login walls.
- Do not read cookies, browser profiles, local/session storage, Bitwarden vault data, or secrets.
- If a site blocks, fails, or returns partial data, report `blocked`, `failed`, or `partial`; do not invent data.
- JobPlanet fields stay `not_collected` in V1.
