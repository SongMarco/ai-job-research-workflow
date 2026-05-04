# Architecture

This project separates agent orchestration from deterministic execution.

## Flow

```txt
Codex skill
  -> CLI argument parser
    -> source collector
      -> source normalizer
        -> repository layer
          -> SQLite
            -> Markdown / SQL review output
```

## Boundaries

- Skills define the workflow contract.
- CLIs perform repeatable execution.
- Source clients only fetch public data and classify blocked access explicitly.
- Normalizers convert source payloads into canonical listing records.
- SQLite keeps source rows intact.
- Queries dedupe for review without deleting raw observations.

## Why This Pattern

LLMs are useful for orchestration, summarization, and interactive review. They
are weaker as the source of truth for semi-structured data. This repo keeps the
facts in deterministic code and storage, then lets the agent operate around that
system.
