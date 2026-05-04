# Case Study

## Problem

Job research is repetitive and semi-structured: search listings, open details,
check whether each role is relevant, compare companies, and prepare a reviewable
summary.

## Approach

I built a Codex skill-first workflow that turns that loop into a reproducible
software pipeline. Codex acts as the automation interface, while TypeScript CLIs
and SQLite handle the factual work.

## Design Choices

- The agent orchestrates; it does not invent listings or company data.
- Source-specific collectors are isolated behind typed clients.
- Normalized rows are stored in SQLite.
- Enrichment data is joined later through explicit keys.
- Reports are Markdown so the output remains easy to inspect.
- Safety boundaries are part of the workflow, not an afterthought.

## Result

The project demonstrates how AI can be used as an automation layer over a
deterministic workflow: useful for messy internal operations, research tasks,
and repeated knowledge-work processes where traceability matters.

## What This Demonstrates

- Turning an ambiguous personal workflow into software
- Combining agent workflows with typed CLIs
- Separating orchestration from source-of-truth data handling
- Building reviewable artifacts instead of opaque chatbot output
- Applying safety constraints around public data collection
