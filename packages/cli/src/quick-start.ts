/**
 * Usage cheat sheet shown by `tsk`, `tsk --help` and `tsk operations`. Lines
 * start with `#` or `$` so operation-list parsers only pick up operation rows.
 */
export const QUICK_START = [
  "# tsk: Typesense CLI. Form: tsk <group> <action> [required args] [--<input field> value ...] [--json]",
  "# Start here: every collection with doc count, aliases, linked synonym/curation sets, and fields with type and facet/sort flags:",
  "$ tsk collections list --compact",
  "# Search: extra flags are Typesense search params. q defaults to * (all documents); query_by is only needed for text queries:",
  "$ tsk search products --filter-by 'price:<100 && in_stock:=true' --sort-by price:asc --per-page 5 --include-fields id,name,price --compact",
  "$ tsk search products --q 'desk lamp' --query-by name,description --compact",
  "# Count: --per-page 0, read found. Counts per value: --facet-by brand --max-facet-values 250 --per-page 0 (numeric facets also give min/max/avg/sum over all matches).",
  "$ tsk documents get products <id>",
  "$ tsk documents export products --filter-by 'in_stock:=true' --include-fields id,price --format jsonl",
  '# Any operation also takes --input \'<JSON>\' (e.g. --input \'{"collection":"products","params":{"q":"*"}}\'). --compact gives dense output on any operation. Destructive writes need --yes.',
  "# More: tsk <group> --help | tsk <operation> --help (inputs, flags, examples) | --schema",
].join("\n");
