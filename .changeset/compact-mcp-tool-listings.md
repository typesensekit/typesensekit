---
"@typesensekit/core": patch
"@typesensekit/mcp": patch
---

Cut MCP tool-definition size by about a quarter (read-only 19.6k → 14.9k chars, full access 46.2k → 33.8k): tool listings drop `$schema`, `additionalProperties: false` and descriptions that repeat the server instructions, `collections.fields.drop` only advertises its real inputs, and rarely used vector/wait options are named instead of typed. Calls are still validated against the full input schemas. Compact `collections.list` now shows fields as `name: type [non-default flags]` with aliases and `text_fields` (query_by candidates) per collection. Field-flag errors (facet, sort, filter, non-indexed, missing query_by) list the collection's fields, and `collections.fields.replace` returns `num_documents`.
