---
"@typesensekit/cli": patch
---

Fix flag handling found in review: `--yes false` no longer confirms a destructive operation, `--params '{...}'` is used as the search/export params object (individual `--<param>` flags still override it), `--compact` output redacts credentials in collection schemas, and `collections.list --input '{"compact":true}' --compact` prints the compact result instead of an empty schema.
