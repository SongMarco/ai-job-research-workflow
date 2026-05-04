# AI Job Research Workflow

Use Codex skills to turn repetitive job-discovery research into a reproducible
SQLite + Markdown workflow.

This repo is not a chatbot transcript and not a one-off scraping script. It is a
skill-first workflow surface: Codex chooses the workflow, TypeScript CLIs execute
the deterministic work, SQLite stores the facts, and Markdown makes the result
reviewable.

## Recommended Default Flow

If you want the intended experience, start inside Codex and call the skills:

```text
$search-jobs
$jobplanet-company-profiles
$jd-jobplanet-query
$db-markdown-report
```

That is the main path.

1. `$search-jobs` collects and normalizes JD candidates.
2. `$jobplanet-company-profiles` fills company enrichment data.
3. `$jd-jobplanet-query` asks the DB useful questions.
4. `$db-markdown-report` turns DB results into reviewable Markdown.

## Start Here If You Are New

Install dependencies and verify the repo first:

```bash
pnpm install
pnpm test
pnpm typecheck
```

Then dry-run the default job-search plan:

```bash
pnpm search-jobs -- --dry-run-plan
```

The default local paths are:

```txt
data/headhunter.db
results/search-jobs/
results/jobplanet-company-profiles/
```

`data/` and `results/` are intentionally gitignored. This public repo uses
synthetic fixtures and sample reports only.

## A Simple Mental Model

Codex does not become the source of truth.

It routes and operates the workflow:

- Codex skills define the repeatable user-facing workflows.
- TypeScript CLIs perform bounded deterministic execution.
- SQLite stores source rows and enrichment facts.
- SQL handles joining, ranking, and deduping.
- Markdown reports keep the output human-reviewable.

The important design choice: AI orchestrates; code records the facts.

## Skill Surface

| Skill | Use it for | Main output |
| --- | --- | --- |
| `$search-jobs` | Collect JD candidates from supported sources | `job_listings` + Markdown |
| `$jobplanet-company-profiles` | Import or collect company profile enrichment | `company_profiles` |
| `$jd-jobplanet-query` | Query JDs joined with company scores | SQL / CSV |
| `$db-markdown-report` | Export DB summaries and query results | Markdown |

Skills live in:

```txt
.codex/skills/
```

## `$search-jobs`

Use this when you want Codex to run the JD collection workflow.

Default Codex prompt:

```text
$search-jobs
Collect Node-family backend JD candidates and save SQLite plus Markdown results.
After completion, report the DB row count, Markdown path, and git status.
```

Wanted-specific prompt:

```text
$search-jobs
Run the Wanted workflow with the public demo query.
Use deterministic CLI execution, not browser scraping.
```

Remember-specific prompt:

```text
$search-jobs
Run the Remember backend search and keep only detail pages with Node, Nest, or TypeScript signals.
Save SQLite and Markdown outputs, then summarize filtered-in and filtered-out counts.
```

Equivalent CLI:

```bash
pnpm search-jobs -- wanted --query node_backend_public_demo
pnpm search-jobs -- remember --query node_backend_remember
pnpm search-jobs -- --dry-run-plan
```

## `$jobplanet-company-profiles`

Use this after JD rows exist and you want company enrichment data.

Check current enrichment status:

```text
$jobplanet-company-profiles
Inspect the current company_profiles status counts.
Do not collect live data yet.
```

Run deterministic import first:

```text
$jobplanet-company-profiles
Fill company_profiles using trusted legacy data if available.
Only import exact normalized_company matches.
Leave partial or fuzzy evidence out of rating fields.
```

Public live collection path:

```text
$jobplanet-company-profiles
Collect remaining not_collected company profiles using public unauthenticated access only.
If CAPTCHA, authwall, Cloudflare, login, 403, or 429 appears, mark blocked and stop safely.
```

Equivalent CLI:

```bash
pnpm jobplanet:profiles -- --dry-run
pnpm jobplanet:profiles
pnpm jobplanet:profiles -- --live --headed
pnpm jobplanet:profiles -- --live --headed --retry-status not_found
```

## `$jd-jobplanet-query`

Use this when the DB has JD rows and company enrichment, and you want a useful
candidate list or inspection query.

Default deduped query:

```text
$jd-jobplanet-query
Give me the default deduped query across all platforms.
Include JD detail URLs, company score fields, JobPlanet URLs, duplicate_count, and duplicate_sources.
```

Raw source-by-source query:

```text
$jd-jobplanet-query
Give me the raw job_listings rows joined with company_profiles.
Do not dedupe.
```

Duplicate inspection query:

```text
$jd-jobplanet-query
Show only likely duplicate JD groups across platforms so I can review the dedupe behavior.
```

CSV export prompt:

```text
$jd-jobplanet-query
Export the default deduped JD + company profile result as CSV.
Summarize the output path and row count.
```

## `$db-markdown-report`

Use this for ad hoc DB summaries, snapshots, and review artifacts.

Basic prompt:

```text
$db-markdown-report
Summarize the current SQLite database as Markdown.
Include table counts first, then the requested result table.
```

Joined report prompt:

```text
$db-markdown-report
Create a Markdown report of JD rows joined with company profile scores.
Use LEFT JOIN so missing enrichment does not hide JDs.
Render nullable numeric values as blank, not 0.0.
```

The skill writes reports under:

```txt
results/
```

## Operator CLI Surface

These commands are useful, but they are not the main onboarding path. The main
path is calling skills from Codex.

```bash
pnpm search-jobs -- --dry-run-plan
pnpm search-jobs -- wanted --query node_backend_public_demo
pnpm search-jobs -- remember --query node_backend_remember
pnpm jobplanet:profiles -- --dry-run
pnpm test
pnpm typecheck
```

Useful SQLite checks:

```bash
sqlite3 -header -column data/headhunter.db ".tables"
sqlite3 data/headhunter.db "PRAGMA integrity_check;"
```

## Safety Boundaries

The repo is designed around safe, reviewable automation:

- Prefer deterministic CLI/module execution over manual browser scraping.
- Do not use cookies, browser profiles, local/session storage, vault data, or secrets.
- Do not bypass CAPTCHA, authwalls, MFA, OAuth/risk prompts, Cloudflare, login walls, or rate limits.
- Treat blocked access as `blocked`, not as a challenge to work around.
- Keep source rows; dedupe at query time instead of deleting facts.
- Keep real databases and real reports out of the public repo.

## Example Output

See [examples/sample-report.md](examples/sample-report.md) for a synthetic report
that demonstrates the review artifact shape without exposing real collected
data.

## Architecture And Case Study

- [Architecture](docs/architecture.md)
- [Case study](docs/case-study.md)
