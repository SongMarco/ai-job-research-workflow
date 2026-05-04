# Sample Job Research Report

- Generated at: `2026-05-04 09:00:00 KST`
- Data: synthetic sample rows
- Purpose: demonstrate output shape without exposing real collected data

## Summary

| metric | value |
| --- | ---: |
| source rows | 4 |
| deduped candidates | 3 |
| companies with enrichment | 2 |
| companies without enrichment | 1 |

## Review Rows

| source | company | title | profile match | company score | detail url |
| --- | --- | --- | --- | ---: | --- |
| wanted | Alpha Labs | Node.js Backend Engineer | pass | 4.2 | https://example.com/jobs/1001 |
| remember | Alpha Labs | Node.js Backend Engineer | duplicate | 4.2 | https://example.com/jobs/2001 |
| wanted | Beta Studio | Platform Backend Engineer | pass | 3.8 | https://example.com/jobs/1002 |
| remember | Gamma Works | TypeScript API Engineer | pass |  | https://example.com/jobs/2003 |

## Notes

The real workflow writes local SQLite and Markdown artifacts under gitignored
paths. Public examples should stay synthetic.
