/**
 * Usage cheat sheet shown by `tsk`, `tsk --help` and `tsk operations`. Lines
 * start with `#` or `$` so operation-list parsers only pick up operation rows.
 */
export const QUICK_START = [
  "# tsk: Typesense CLI. Form: tsk <group> <action> [required args] [--<input field> value ...] [--json]",
  "# Discovery: use the connected collection overview below directly (names, aliases, field flags, synonym/curation sets). To refresh it, or if absent:",
  "$ tsk collections list --compact",
  "# Search: extra flags are Typesense search params. q defaults to * (all documents); query_by is only needed for text queries:",
  "$ tsk search products --filter-by 'price:<100 && in_stock:=true' --sort-by price:asc --per-page 5 --include-fields id,name,price --compact",
  "$ tsk search products --q 'desk lamp' --query-by name,description --compact",
  "# Count: --per-page 0, read found. Counts per value: --facet-by brand --max-facet-values 250 --per-page 0 (numeric facets also give min/max/avg/sum over all matches).",
  "$ tsk documents get products <id>",
  "$ tsk documents export products --filter-by 'in_stock:=true' --include-fields id,price --format jsonl",
  '# Any operation also takes --input \'<JSON>\' (e.g. --input \'{"collection":"products","params":{"q":"*"}}\'). --compact gives dense output on any operation. Destructive writes need --yes.',
  "# Recipes (tsk <group> --help): saved searches = presets; synonyms = synonym_sets; hidden/pinned results = curation_sets; field facet/sort/index fixes = collections; bulk edits/deletes/copies/backups = documents.",
  "# More: tsk <group> --help | tsk <operation> --help (inputs, flags, examples) | --schema",
].join("\n");

/**
 * Task recipes shown by `tsk <group> --help`. Kept out of QUICK_START, which
 * every session reads, so only sessions that need a recipe pay for it.
 */
export const GROUP_RECIPES: Record<string, string[]> = {
  collections: [
    "Schema repair: tsk collections fields replace --collection products --field brand --facet true --yes (re-indexes stored values; no export/import needed). Pass all flags to retain; omitted flags reset to defaults. Returns before/after.",
  ],
  presets: [
    `Saved searches: tsk presets retrieve <name>; tsk presets create <name> --value '{"query_by":"name,description"}' (create or replace).`,
  ],
  synonym_sets: [
    `Synonyms (v30+): tsk synonym_sets retrieve <set>; tsk synonym_sets items create <set> <id> --value '{"synonyms":["sofa","couch"]}'. Sets are linked in collection schemas.`,
  ],
  curation_sets: [
    "Hidden/pinned hits: inspect the collection's curation_sets with tsk curation_sets retrieve <set>; --enable-overrides false bypasses rules for diagnosis.",
  ],
  documents: [
    "Bulk writes: documents import / update_by_filter / delete_by_filter / copy (--yes).",
    "Files: use inline --input / --value / --document JSON to avoid temp files. Backups: tsk documents export products --format jsonl > backup.jsonl (working directory).",
  ],
};
