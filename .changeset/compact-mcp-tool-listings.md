---
"@typesensekit/mcp": patch
---

Reduce MCP context overhead:

- Tool listings are about 40% smaller than in 1.5 (read-only 23.6k → 14.9k chars). They drop `$schema`, `additionalProperties: false` and descriptions that repeat the server instructions; `collections.fields.drop` only advertises its real inputs; rarely used vector and wait options are named instead of typed. Calls are still validated against the full input schemas.
- Tool guidance is more concise, and JSON responses are unindented (lossless).
- New opt-in `collections.list {compact: true}`: one call returns every collection's fields as `name: type [non-default flags]`, its aliases, linked synonym and curation sets, and `text_fields` (candidates for `query_by`). Full schemas and search defaults are unchanged.
- Errors about field flags (facet, sort, filter, non-indexed, missing `query_by`) list the collection's fields, and `collections.fields.replace` returns `num_documents`.
