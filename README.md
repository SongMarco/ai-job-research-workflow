# AI Job Research Workflow

A Codex skill-first automation pipeline for repetitive job-discovery research.

The project demonstrates a practical pattern for using AI agents at work: the
agent orchestrates the workflow, while deterministic TypeScript CLIs collect,
normalize, store, and report factual data.

## What This Shows

- Codex skills as repeatable workflow entry points
- TypeScript CLIs for deterministic execution
- SQLite as the source of truth
- Source-specific collectors mapped into a canonical JD schema
- Company metadata enrichment with explicit match provenance
- Markdown reports for human review
- Tests and fixtures around parsing, filtering, persistence, and reporting
- Safety boundaries for public-data collection

## Architecture

```txt
Codex skill
  -> TypeScript CLI
    -> source collector
      -> normalizer
        -> SQLite
          -> SQL / Markdown report
```

The important design choice is that the AI does not invent or mutate job data.
It triggers bounded workflows and summarizes outputs. Data collection,
normalization, filtering, and persistence live in code and tests.

## Quick Start

```bash
pnpm install
pnpm test
pnpm typecheck
```

Default local DB path:

```txt
data/headhunter.db
```

Generated local outputs:

```txt
results/search-jobs/
results/jobplanet-company-profiles/
```

`data/` and `results/` are intentionally gitignored. This public snapshot does
not include real databases, collected job listings, company lists, or private
reports.

## Codex Skills

| Skill | Use for |
| --- | --- |
| `$search-jobs` | Collect JD candidates from supported sources and save SQLite + Markdown |
| `$jobplanet-company-profiles` | Fill or refresh company profile enrichment data |
| `$jd-jobplanet-query` | Query JD rows joined with company profile scores |
| `$db-markdown-report` | Export ad hoc SQLite query results as Markdown |

Skills live under:

```txt
.codex/skills/
```

## CLI Surface

```bash
pnpm search-jobs -- wanted --query node_backend_public_demo
pnpm search-jobs -- remember --query node_backend_remember
pnpm search-jobs -- --dry-run-plan
pnpm jobplanet:profiles -- --dry-run
```

Live collection paths are intentionally bounded. The repo prefers deterministic
fixtures and local CLI execution over manual browser scraping.

## Safety Boundaries

- Do not use cookies, browser profiles, local/session storage, vault data, or secrets.
- Do not bypass CAPTCHA, authwalls, MFA, OAuth/risk prompts, Cloudflare, login walls, or rate limits.
- Treat blocked access as `blocked`, not as a challenge to work around.
- Keep raw source rows; use query-level dedupe instead of deleting facts.
- Use synthetic fixtures and sample outputs in public artifacts.

## Example Output

See [examples/sample-report.md](examples/sample-report.md) for a synthetic
report that mirrors the shape of a generated review artifact without exposing
real companies or collected listings.

## Case Study

See [docs/case-study.md](docs/case-study.md) for the portfolio narrative:
how this project turns a messy, repetitive research task into a reproducible
AI-assisted software workflow.
