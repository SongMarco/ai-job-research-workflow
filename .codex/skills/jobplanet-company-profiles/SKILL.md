---
name: jobplanet-company-profiles
description: Use when ai-job-research-workflow company_profiles need JobPlanet ratings, review counts, remaining not_collected rows, legacy imports, or safe public collection/import handling.
---

# jobplanet-company-profiles

Use when the user asks to fill, import, refresh, inspect, or continue JobPlanet rating/review data in `company_profiles`.

## Default DBs

- Current DB: `data/headhunter.db`
- Legacy DB: `/Users/youngchansong/Documents/projects/job-finder/data/lineage-catalog.db`

## Baseline Workflow

1. Check current status:

```bash
sqlite3 -header -column data/headhunter.db "
SELECT jobplanet_status, COUNT(*) AS count
FROM company_profiles
GROUP BY jobplanet_status
ORDER BY jobplanet_status;"
```

2. Dry-run legacy import:

```bash
pnpm jobplanet:profiles -- --dry-run
```

3. Import exact normalized-company matches from legacy DB:

```bash
pnpm jobplanet:profiles
```

To retry rows already marked `not_found`, use:

```bash
pnpm jobplanet:profiles -- --live --headed --retry-status not_found
```

4. Verify:

```bash
sqlite3 -header -column data/headhunter.db "
SELECT jobplanet_status, COUNT(*) AS count
FROM company_profiles
GROUP BY jobplanet_status
ORDER BY jobplanet_status;"
```

## Remaining Ratings

Use this path after the legacy import leaves `not_collected` rows.

1. Export remaining companies for the next collection/import step:

```bash
mkdir -p results/jobplanet-company-profiles
sqlite3 -header -csv data/headhunter.db "
SELECT normalized_company, company_display
FROM company_profiles
WHERE jobplanet_status = 'not_collected'
ORDER BY normalized_company;" \
> results/jobplanet-company-profiles/remaining-not-collected.csv
```

2. Prefer deterministic imports before live collection. First verify the legacy/default DB path exists; in the current `/Users/mcs` environment no `lineage-catalog.db` was found at the historical default paths, so skip legacy import unless a trusted DB/CSV is explicitly present. If another trusted DB/CSV exists, import only rows whose `normalized_company` exactly matches `company_profiles.normalized_company`.

3. If implementing a live collector, target only the exported `not_collected` rows and upsert every attempted company as one of:
   - `ok`: rating/review data found for an exact JobPlanet match.
   - `not_found`: public search completed but no candidate matched.
   - `blocked`: JobPlanet returned CAPTCHA/authwall/Cloudflare/rate-limit/login-wall/HTTP 403/429.
   - `failed`: transient or parser failure worth retrying later.

4. For live searches, use the primary company name before a parenthesized alias: `xxx(yyy)` must search JobPlanet as `xxx`, while keeping the DB key as the original `normalized_company`.

5. Do not automatically import partial/fuzzy matches into `jobplanet_rating` or `jobplanet_review_count`. Store partial evidence only in metadata or a separate review artifact unless the user explicitly approves a manual match.

## Existing Implementation To Reuse

Use the old `job-finder` implementation as a reference, not as an unsafe execution recipe:

- `/Users/youngchansong/Documents/projects/job-finder/src/services/company-enrichment.ts`
  - Reuse parser ideas: `parseRating()`, `parseReviewCount()`, search candidate extraction, exact vs partial candidate choice.
  - Reuse status handling shape: `ok`, `not_found`, `blocked`, `failed`.
- `/Users/youngchansong/Documents/projects/job-finder/src/jobplanet-scores/cli.ts`
  - Reuse target selection, dry-run behavior, and status-preserving upsert pattern.
- `/Users/youngchansong/Documents/projects/job-finder/.claude/skills/jobplanet-scores/SKILL.md`
  - Treat as historical context only. Do not copy authenticated browser/CDP instructions into this repo.

When porting code, adapt it to `SearchJobsRepo` and `company_profiles`; keep `pnpm jobplanet:profiles` as the primary CLI surface or add subcommands under the same command.

## Policy

- Prefer deterministic DB import over live scraping.
- Import only exact `normalized_company` matches.
- Do not import partial/fuzzy matches into rating fields automatically.
- Public unauthenticated HTTP/browser access is allowed only while pages are normally accessible.
- Do not bypass CAPTCHA, authwall, MFA, OAuth/risk prompts, Cloudflare, rate limits, or login walls.
- Do not use cookies, browser profiles, local/session storage, Bitwarden vault data, secrets, or authenticated CDP sessions.
- If JobPlanet blocks access, store `blocked` or report it; do not invent data.

## Acceptance

- Status counts are checked before and after the run.
- All attempted companies are represented in `company_profiles`.
- `ok` rows have exact-match provenance, rating/review count when present, URL, observed timestamp, and raw metadata.
- A remaining CSV or run artifact is saved under `results/jobplanet-company-profiles/` when unfinished rows remain.
