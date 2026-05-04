# Repository Agent Instructions

This repo is Codex-skill-first.

## Local Skills

Project skills live in `.codex/skills/<skill-name>/SKILL.md`.

When a user names one of these local skills or asks for a workflow covered by
them, read the matching `SKILL.md` before acting:

- `search-jobs`
- `jobplanet-company-profiles`
- `jd-jobplanet-query`
- `db-markdown-report`

## Safety

Prefer deterministic CLI/module execution over manual browser scraping. Do not
bypass CAPTCHA, authwalls, MFA, OAuth/risk prompts, Cloudflare, rate limits, or
login walls. Do not read cookies, browser profiles, local/session storage,
password managers, vault data, or secrets.

## Public Data Boundary

This public repository should not contain real collected databases, private
search results, raw production responses, or personal target-company lists. Use
synthetic fixtures and sample reports for examples.
