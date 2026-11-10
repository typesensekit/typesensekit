---
"@typesensekit/cli": minor
---

Make the CLI faster to learn from a shell. `tsk`, `tsk --help` and `tsk operations` now open with a quick-start cheat sheet. Every input field can be passed as a `--<field> value` flag, and search/export accept Typesense parameters as flags (`tsk search products --filter-by 'price:<100' --per-page 0 --compact`) or as flat `--input` keys, with `q` defaulting to `*`. `collections list|retrieve --compact` prints a short overview with document counts, aliases and field facet/sort flags. Operation help shows descriptions and field docs, `yes: true` in `--input` confirms destructive operations, and errors name unknown input fields and list a collection's fields when a field name is wrong. Existing commands, flags and `--json` output are unchanged.
