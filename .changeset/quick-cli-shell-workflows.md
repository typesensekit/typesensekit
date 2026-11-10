---
"@typesensekit/cli": patch
---

Reduce CLI startup work by lazily constructing command arguments and caching schema conversion. Restore live discovery in top-level help, explain common write and schema-repair workflows, and accept API key IDs as positional arguments.
