---
name: query-jobs
description: Use when codex-job-finder users need SQL to query job_listings/JDs joined with JobPlanet company scores across Remember, Wanted, or all platforms.
---

# query-jobs

Use this when the user asks for JD/job listing queries that include JobPlanet rating, review count, JobPlanet URL, and JD detail links.

## Defaults

- DB: `data/headhunter.db`
- Listing table: `job_listings`
- Company enrichment table: `company_profiles`
- Join key: `normalized_company`
- Always use `LEFT JOIN` so `not_found` or missing enrichment does not hide JDs.
- `j.url` is the JD/detail-page URL. Alias it as `jd_detail_url`.
- **Default query should dedupe cross-platform duplicate JDs.** Keep raw/all rows only when the user explicitly asks for raw rows or no deduplication.
- Deduplication is query-level only. Do not delete source rows.

## Inspect Before Querying

```bash
sqlite3 -header -column data/headhunter.db "
SELECT platform, COUNT(*) AS listing_count, COUNT(DISTINCT normalized_company) AS company_count
FROM job_listings
GROUP BY platform
ORDER BY platform;

SELECT jobplanet_status, COUNT(*) AS company_count
FROM company_profiles
GROUP BY jobplanet_status
ORDER BY jobplanet_status;
"
```

## Default: Deduped JD Rows With JobPlanet Scores

Use this by default when the user says "all JDs", "platform agnostic", "구직 플랫폼 가리지 않고", or wants the candidate list.

This collapses likely cross-platform duplicates by normalized company/title keys while keeping original rows in the DB. Representative row priority:

1. rows with JobPlanet rating first
2. higher JobPlanet rating/review count
3. `remember` before `wanted`
4. latest `last_seen_at` / highest source id

```bash
sqlite3 -header -column data/headhunter.db "
WITH normalized AS (
  SELECT
    j.*,
    p.jobplanet_status,
    p.jobplanet_rating,
    p.jobplanet_review_count,
    p.jobplanet_url,
    lower(
      replace(
        replace(
          replace(
            replace(j.normalized_company, '(주)', ''),
          '주식회사', ''),
        ' ', ''),
      '.', '')
    ) AS company_key,
    lower(
      replace(
        replace(
          replace(
            replace(
              replace(j.title, ' ', ''),
            '[', ''),
          ']', ''),
        '(', ''),
      ')', '')
    ) AS title_key
  FROM job_listings j
  LEFT JOIN company_profiles p
    ON p.normalized_company = j.normalized_company
),
ranked AS (
  SELECT
    *,
    COUNT(*) OVER (
      PARTITION BY company_key, title_key
    ) AS duplicate_count,
    GROUP_CONCAT(source_marker, ', ') OVER (
      PARTITION BY company_key, title_key
    ) AS duplicate_sources,
    ROW_NUMBER() OVER (
      PARTITION BY company_key, title_key
      ORDER BY
        CASE WHEN jobplanet_rating IS NULL THEN 1 ELSE 0 END,
        jobplanet_rating DESC,
        jobplanet_review_count DESC,
        CASE platform
          WHEN 'remember' THEN 0
          WHEN 'wanted' THEN 1
          ELSE 2
        END,
        last_seen_at DESC,
        CAST(source_job_id AS INTEGER) DESC
    ) AS rn
  FROM normalized
)
SELECT
  platform,
  source_marker,
  title,
  company,
  normalized_company,
  location,
  experience_text,
  required_skills_json,
  jobplanet_status,
  jobplanet_rating,
  jobplanet_review_count,
  jobplanet_url,
  url AS jd_detail_url,
  duplicate_count,
  duplicate_sources
FROM ranked
WHERE rn = 1
ORDER BY
  CASE WHEN jobplanet_rating IS NULL THEN 1 ELSE 0 END,
  jobplanet_rating DESC,
  jobplanet_review_count DESC,
  company,
  title;
"
```

## Duplicate Candidate Inspection Query

Use this when the user asks why rows disappeared or wants to review duplicate groups.

```bash
sqlite3 -header -column data/headhunter.db "
WITH normalized AS (
  SELECT
    j.*,
    lower(replace(replace(replace(replace(j.normalized_company, '(주)', ''), '주식회사', ''), ' ', ''), '.', '')) AS company_key,
    lower(replace(replace(replace(replace(replace(j.title, ' ', ''), '[', ''), ']', ''), '(', ''), ')', '')) AS title_key
  FROM job_listings j
)
SELECT
  company_key,
  title_key,
  COUNT(*) AS duplicate_count,
  GROUP_CONCAT(source_marker, ', ') AS sources,
  GROUP_CONCAT(company, ' | ') AS companies,
  GROUP_CONCAT(title, ' | ') AS titles
FROM normalized
GROUP BY company_key, title_key
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, company_key, title_key;
"
```

## Raw All JD Rows With JobPlanet Scores

Use only when the user explicitly asks for raw rows, source-by-source rows, or no deduplication.

```bash
sqlite3 -header -column data/headhunter.db "
SELECT
  j.platform,
  j.source_marker,
  j.title,
  j.company,
  j.normalized_company,
  j.location,
  j.experience_text,
  j.required_skills_json,
  p.jobplanet_status,
  p.jobplanet_rating,
  p.jobplanet_review_count,
  p.jobplanet_url,
  j.url AS jd_detail_url
FROM job_listings j
LEFT JOIN company_profiles p
  ON p.normalized_company = j.normalized_company
ORDER BY
  CASE WHEN p.jobplanet_rating IS NULL THEN 1 ELSE 0 END,
  p.jobplanet_rating DESC,
  p.jobplanet_review_count DESC,
  j.platform,
  CAST(j.source_job_id AS INTEGER) DESC;
"
```

## Remember-Only JD Rows With JobPlanet Scores

Use when the user asks specifically for Remember rows or `remember:%` results. If they do not ask for raw Remember rows, keep the same dedupe pattern by adding `WHERE source_marker LIKE 'remember:%'` inside the `normalized` CTE.

Raw Remember query:

```bash
sqlite3 -header -column data/headhunter.db "
SELECT
  j.platform,
  j.source_marker,
  j.title,
  j.company,
  j.normalized_company,
  j.location,
  j.experience_text,
  j.required_skills_json,
  p.jobplanet_status,
  p.jobplanet_rating,
  p.jobplanet_review_count,
  p.jobplanet_url,
  j.url AS jd_detail_url
FROM job_listings j
LEFT JOIN company_profiles p
  ON p.normalized_company = j.normalized_company
WHERE j.source_marker LIKE 'remember:%'
ORDER BY
  CASE WHEN p.jobplanet_rating IS NULL THEN 1 ELSE 0 END,
  p.jobplanet_rating DESC,
  p.jobplanet_review_count DESC,
  CAST(j.source_job_id AS INTEGER) DESC;
"
```

## Summary by Platform and JobPlanet Status

```bash
sqlite3 -header -column data/headhunter.db "
SELECT
  j.platform,
  COALESCE(p.jobplanet_status, 'missing_profile') AS jobplanet_status,
  COUNT(*) AS listing_count,
  COUNT(DISTINCT j.normalized_company) AS company_count,
  SUM(CASE WHEN p.jobplanet_rating IS NOT NULL THEN 1 ELSE 0 END) AS listings_with_rating
FROM job_listings j
LEFT JOIN company_profiles p
  ON p.normalized_company = j.normalized_company
GROUP BY
  j.platform,
  COALESCE(p.jobplanet_status, 'missing_profile')
ORDER BY
  j.platform,
  jobplanet_status;
"
```

## CSV Export

Default CSV export should use the deduped query.

```bash
mkdir -p results/jobplanet-company-profiles
sqlite3 -header -csv data/headhunter.db "
WITH normalized AS (
  SELECT
    j.*,
    p.jobplanet_status,
    p.jobplanet_rating,
    p.jobplanet_review_count,
    p.jobplanet_url,
    lower(replace(replace(replace(replace(j.normalized_company, '(주)', ''), '주식회사', ''), ' ', ''), '.', '')) AS company_key,
    lower(replace(replace(replace(replace(replace(j.title, ' ', ''), '[', ''), ']', ''), '(', ''), ')', '')) AS title_key
  FROM job_listings j
  LEFT JOIN company_profiles p
    ON p.normalized_company = j.normalized_company
),
ranked AS (
  SELECT
    *,
    COUNT(*) OVER (PARTITION BY company_key, title_key) AS duplicate_count,
    GROUP_CONCAT(source_marker, ', ') OVER (PARTITION BY company_key, title_key) AS duplicate_sources,
    ROW_NUMBER() OVER (
      PARTITION BY company_key, title_key
      ORDER BY
        CASE WHEN jobplanet_rating IS NULL THEN 1 ELSE 0 END,
        jobplanet_rating DESC,
        jobplanet_review_count DESC,
        CASE platform WHEN 'remember' THEN 0 WHEN 'wanted' THEN 1 ELSE 2 END,
        last_seen_at DESC,
        CAST(source_job_id AS INTEGER) DESC
    ) AS rn
  FROM normalized
)
SELECT
  platform,
  source_marker,
  title,
  company,
  normalized_company,
  location,
  experience_text,
  required_skills_json,
  jobplanet_status,
  jobplanet_rating,
  jobplanet_review_count,
  jobplanet_url,
  url AS jd_detail_url,
  duplicate_count,
  duplicate_sources
FROM ranked
WHERE rn = 1
ORDER BY
  CASE WHEN jobplanet_rating IS NULL THEN 1 ELSE 0 END,
  jobplanet_rating DESC,
  jobplanet_review_count DESC,
  company,
  title;
" > results/jobplanet-company-profiles/all-jds-with-jobplanet-deduped.csv
```

## Rules

- Include both URLs when available:
  - `j.url AS jd_detail_url`
  - `p.jobplanet_url`
- Default to deduped results. Use raw results only when explicitly requested.
- Do not filter to only `ok` unless the user explicitly asks; `not_found` is useful signal.
- Prefer `LEFT JOIN`, not `INNER JOIN`.
- Do not delete duplicate source rows; dedupe in query/view/export only.
- If exporting for spreadsheet use, prefer `-csv`; if replying inline, prefer `-column`.
- If the user shows stale `not_collected` data, first verify they are querying the latest `data/headhunter.db` on `origin/main`.
