---
"@typesensekit/mcp": minor
"@typesensekit/cli": minor
---

Help AI agents finish Typesense tasks in fewer calls:

- MCP tools now carry agent-oriented descriptions, and the server sends instructions covering discovery, search parameters, filter syntax, facets, synonym and curation sets, and schema changes.
- `search`, `documents.search` and `documents.export` document common Typesense parameters (`q`, `query_by`, `filter_by`, `sort_by`, `facet_by`, `per_page`, ...) while still accepting any other parameter.
- New optional `compact: true` on `search`, `documents.search` and `multi_search` returns hits as `{document}` only, without highlight and text-match metadata (`compact` inside `params` or a multi-search entry is honored too).
- New `documents.delete_by_filter`, `documents.update_by_filter` and `documents.copy` (server-side copy between collections, for reindexing) operations, full access only.
- `collections.fields.*` expose `facet`, `sort`, `index`, `optional`, `infix`, `stem` and `locale` in their schemas; `collections.fields.replace` defaults `type` to the field's current type.
- MCP errors add hints for common Typesense failures (in-place field changes, non-facetable, non-sortable or unindexed fields, missing `query_by`, unknown collections), and legacy `overrides.list` now points to the linked curation sets on Typesense v30.
