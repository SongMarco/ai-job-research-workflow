# codex-job-finder

Codex skill-first workflow for job research automation.

Codex runs the workflow. TypeScript CLIs do the deterministic work. SQLite keeps
the facts. Markdown makes the result reviewable.

## Install

```bash
git clone https://github.com/SongMarco/codex-job-finder.git
cd codex-job-finder
pnpm install
pnpm test
pnpm typecheck
```

## Use In Codex

Run the skills in this order:

```text
$search-jobs
Find Node-family backend JD candidates.
```

```text
$jobplanet-company-profiles
Fill missing company profile enrichment for the collected companies, using exact matches only, and report status counts before and after.
```

```text
$query-jobs
Query and show me top 20 jobs.
```

```text
$db-markdown-report
Create a Markdown report from the current SQLite database with a short summary first and the full result table below.
```

## What Each Skill Does

| Skill | Role |
| --- | --- |
| `$search-jobs` | Collects and normalizes JD candidates into `job_listings` |
| `$jobplanet-company-profiles` | Enriches companies in `company_profiles` |
| `$query-jobs` | Shows JD candidates with company score fields and detail URLs |
| `$db-markdown-report` | Exports DB summaries or query results as Markdown |

Skills live in:

```txt
.codex/skills/
```

Default local outputs:

```txt
data/headhunter.db
results/search-jobs/
results/jobplanet-company-profiles/
```

`data/` and `results/` are gitignored. This public repo includes only synthetic
fixtures and sample reports.

## Safety

- Prefer deterministic CLI/module execution over manual browser scraping.
- Do not use cookies, browser profiles, local/session storage, vault data, or secrets.
- Do not bypass CAPTCHA, authwalls, MFA, OAuth/risk prompts, Cloudflare, login walls, or rate limits.
- Treat blocked access as `blocked`.
- Keep real databases and real reports out of the public repo.

## More

- [Sample report](examples/sample-report.md)
- [Architecture](docs/architecture.md)
- [Case study](docs/case-study.md)
