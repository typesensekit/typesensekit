# @typesensekit/cli

An open-source Typesense CLI for collections, documents, schemas, search,
configuration, and cluster administration.

**[Typesense CLI overview](https://typesensekit.vercel.app/typesense-cli/)** ·
**[Complete CLI guide](https://typesensekit.vercel.app/guides/cli/)** ·
**[GitHub](https://github.com/typesensekit/typesensekit)**

```sh
pnpm add -g @typesensekit/cli
# Secure interactive prompt
tsk profile add local --url http://localhost:8108

# Non-interactive stdin (avoids argv and shell history)
printf '%s' "$TYPESENSE_API_KEY" | tsk profile add ci --url https://typesense.example.com --api-key-stdin

# macOS Keychain-backed profile
tsk profile add production --url https://typesense.example.com --keychain

tsk profile test production
tsk profile export production > profile.json       # omits plaintext keys
tsk profile export production --reveal > backup.json
tsk profile import backup.json
```

Operation results use readable tables where possible. Pass `--json` for stable,
redacted JSON output in scripts.

Destructive operations prompt before execution. Pass `--yes` only for deliberate
non-interactive automation.

Every operation supports `--schema` and `--examples`. Enable shell completion with:

```sh
source <(tsk completion zsh)              # zsh
source <(tsk completion bash)             # bash
tsk completion fish | source              # fish
```

Discover operations and generate integration snippets:

```sh
tsk collections.list --input '{}'
tsk skills mcp
```

See the [API coverage inventory](https://github.com/typesensekit/typesensekit/blob/main/docs/api-coverage.md)
for supported Typesense operations.

### Creating API keys

`keys.create` redacts the new key by default. To retrieve it explicitly from the
CLI, use `--reveal` and store the output securely:

```sh
tsk keys.create --input '{"value":{"description":"Search only","actions":["documents:search"],"collections":["products"]}}' --reveal --json
```

MCP output remains redacted. New or updated Keychain-backed profiles use unique
credential references, so profiles with the same name in separate config files
do not overwrite each other's keys. Existing references remain readable; saving
a legacy profile again with `--keychain` migrates it to a new reference.

### Shell discovery and export formats

Dotted commands also accept grouped paths: `tsk collections list --json` is
an alias for `tsk collections.list --json`. Use `tsk collections --help` for
only that group's operations. Operation help includes input fields and a runnable
example; `--schema` still prints the complete JSON schema. Required string input
fields can also be positional, for example `tsk collections.retrieve products
--json`. Explicit `--input` values take precedence over positional values.

Every input field can also be a flag (`tsk documents get_many --collection
books --ids b1,b2`). For `search`, `documents.search`, and `documents.export`,
other flags are passed through as Typesense parameters, and `q` defaults to `*`:

```sh
tsk search products --filter-by 'price:<100 && in_stock:=true' --sort-by price:asc --per-page 5 --compact --json
tsk search products --facet-by brand --max-facet-values 250 --per-page 0 --compact --json
tsk collections list --compact     # doc counts, aliases, fields with facet/sort flags
```

With a configured cluster, `tsk`, `tsk --help` and `tsk operations` also print
this collection overview (parallel collection and alias requests, skipped silently if the cluster is
unreachable; set `TSK_NO_OVERVIEW=1` to turn it off). `tsk operations` prints
the cheat sheet and overview on stderr, so its stdout stays one
`name<TAB>summary` line per operation for scripts. Without `--json`,
`--compact` search results are printed as valid JSON with one hit or facet
value per line.

Flat `--input` keys work too: `{"collection":"products","filter_by":"price:<100"}`
is read as `{"collection":"products","params":{"q":"*","filter_by":"price:<100"}}`.

Export keeps its existing JSON string output, including with `--json`. For direct
shell processing, select an explicit format:

```sh
tsk documents.export --input '{"collection":"products"}' --format jsonl | jq -c .
tsk documents.export --input '{"collection":"products"}' --format array | jq length
```

Errors print concise messages to stderr and return a nonzero exit status. Add
`--debug` for diagnostic details and a stack trace.

### Short write and repair workflows

Use JSON directly in flags instead of creating a temporary input file:

```sh
tsk presets create catalog_search --value '{"query_by":"name,description"}'
tsk synonym_sets items create catalog-synonyms sofa-couch --value '{"synonyms":["sofa","couch"]}'
tsk documents update products sku-1 --document '{"price":29.99}'
tsk keys retrieve 42 --json
```

To change a field's facet, index, or sort setting, use
`tsk collections fields replace --collection products --field brand --facet true --yes`.
It re-indexes stored document values and returns before/after definitions; an
export/import is unnecessary. Pass every flag you want to retain, because
omitted flags reset to Typesense defaults. If you do want a backup, write it in
your working directory (`tsk documents export products --format jsonl > backup.jsonl`).

The CLI builds argument definitions only for the selected operation to reduce
startup work on each shell invocation.
