---
name: db-markdown-report
description: Use when codex-job-finder SQLite data needs to be inspected, queried, summarized, or exported as a Markdown report from one or more DB tables.
---

# db-markdown-report

Use when the user asks to turn DB contents into Markdown: full lists, joined tables, summaries, snapshots, review tables, or ad hoc query results.

## Inputs

- Default DB: `data/headhunter.db`
- Default output directory: `results/`
- Query source: infer from the user's requested entities, then inspect schema before writing the report.

## Workflow

1. Inspect schema and counts:

```bash
sqlite3 -header -column data/headhunter.db ".tables"
sqlite3 -header -column data/headhunter.db "PRAGMA table_info(<table_name>);"
sqlite3 -header -column data/headhunter.db "SELECT COUNT(*) AS count FROM <table_name>;"
```

2. Build a concrete SQL query that returns exactly the columns the user asked for. Prefer structured SQL joins over post-processing text.

3. Generate Markdown with `sqlite3 -markdown`:

```bash
ts=$(date +%Y%m%d%H%M%S)
out="results/db-report-$ts.md"
mkdir -p results
{
  printf '# DB Report\n\n'
  printf -- '- Generated at: `%s KST`\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  printf -- '- DB: `data/headhunter.db`\n\n'
  printf '## Summary\n\n'
  sqlite3 -header -markdown data/headhunter.db "
    SELECT '<table_name>' AS table_name, COUNT(*) AS rows
    FROM <table_name>;
  "
  printf '\n## Results\n\n'
  sqlite3 -header -markdown data/headhunter.db "
    SELECT
      <columns>
    FROM <table_or_join>
    ORDER BY <stable_order>;
  "
} > "$out"
printf '%s\n' "$out"
```

4. Verify:

```bash
wc -l "$out"
sed -n '1,40p' "$out"
tail -20 "$out"
```

## Report Rules

- Keep all rows the user asked for; use `LEFT JOIN` when enrichment data may be missing.
- Include a short summary section before the full result table.
- Use stable ordering that matches the user's intent. If unspecified, choose a deterministic order from meaningful score/date/name/id fields.
- Render nullable numeric fields explicitly:
  - `CASE WHEN value IS NULL THEN '' ELSE printf('%.1f', value) END`
  - Do not let SQLite `printf()` turn `NULL` into `0.0`.
- Prefer clickable source columns when available, such as `url`, `wanted_url`, or `jobplanet_url`.
- For large tables, write the full Markdown artifact to disk and summarize the path plus key counts in the final answer.

## Common Joins

Wanted listings with JobPlanet profiles:

```sql
SELECT
  jl.source_job_id AS wanted_id,
  jl.company,
  jl.title AS position,
  jl.location,
  jl.experience_text AS experience,
  COALESCE(cp.jobplanet_status, 'missing_profile') AS jobplanet_status,
  CASE WHEN cp.jobplanet_rating IS NULL THEN '' ELSE printf('%.1f', cp.jobplanet_rating) END AS jobplanet_rating,
  CASE WHEN cp.jobplanet_review_count IS NULL THEN '' ELSE CAST(cp.jobplanet_review_count AS TEXT) END AS jobplanet_reviews,
  jl.url AS wanted_url,
  COALESCE(cp.jobplanet_url, '') AS jobplanet_url
FROM job_listings jl
LEFT JOIN company_profiles cp ON cp.normalized_company = jl.normalized_company
ORDER BY
  CASE WHEN cp.jobplanet_rating IS NULL THEN -1 ELSE cp.jobplanet_rating END DESC,
  CASE WHEN cp.jobplanet_review_count IS NULL THEN -1 ELSE cp.jobplanet_review_count END DESC,
  jl.company COLLATE NOCASE,
  CAST(jl.source_job_id AS INTEGER);
```

## Persistence

`results/` is ignored by default. If the user asks for a generated Markdown artifact to be visible on `main`, add it explicitly:

```bash
git add -f "$out"
```
