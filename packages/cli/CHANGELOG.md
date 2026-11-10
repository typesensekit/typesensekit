# @typesensekit/cli

## 1.6.0

### Minor Changes

- 0c94c19: Make the CLI faster to learn from a shell. `tsk` and `tsk --help` now open with a quick-start cheat sheet, and `tsk operations` prints it on stderr so its stdout stays the plain `name<TAB>summary` list. Every input field can be passed as a `--<field> value` flag, and search/export accept Typesense parameters as flags (`tsk search products --filter-by 'price:<100' --per-page 0 --compact`) or as flat `--input` keys, with `q` defaulting to `*`. `collections list|retrieve --compact` prints a short overview with document counts, aliases and field facet/sort flags. When a cluster is configured, `tsk`, `tsk --help` and `tsk operations` also show that overview for the connected cluster (one quick request; silent if unreachable; set `TSK_NO_OVERVIEW=1` to skip). Without `--json`, `--compact` search output is laid out densely (one hit or facet value per line, still valid JSON). `--compact` on other operations prints the same dense layout, and boolean flags accept `--facet true|false`. Extra flags on document writes set document fields (`tsk documents update products p1 --price 9.99`), and singular group names resolve (`tsk key create`). Operation help shows descriptions and field docs, `yes: true` in `--input` confirms destructive operations, and errors name unknown input fields and list a collection's fields when a field name is wrong. Unknown flags and extra arguments still run the command, now with a warning on stderr. Existing commands, flags and `--json` output are unchanged.
- 0c94c19: Accept grouped operation paths and positional string inputs, add focused group and operation help with runnable examples, and report concise errors with diagnostics behind --debug. Add explicit JSONL and array export formats while preserving existing output.
- 0c94c19: Help AI agents finish Typesense tasks in fewer calls:

  - MCP tools now carry agent-oriented descriptions, and the server sends instructions covering discovery, search parameters, filter syntax, facets, synonym and curation sets, and schema changes.
  - `search`, `documents.search` and `documents.export` document common Typesense parameters (`q`, `query_by`, `filter_by`, `sort_by`, `facet_by`, `per_page`, ...) while still accepting any other parameter.
  - New optional `compact: true` on `search`, `documents.search` and `multi_search` returns hits as `{document}` only, without highlight and text-match metadata (`compact` inside `params` or a multi-search entry is honored too).
  - New `documents.delete_by_filter`, `documents.update_by_filter` and `documents.copy` (server-side copy between collections, for reindexing) operations, full access only.
  - `collections.fields.*` expose `facet`, `sort`, `index`, `optional`, `infix`, `stem` and `locale` in their schemas; `collections.fields.replace` defaults `type` to the field's current type.
  - MCP errors add hints for common Typesense failures (in-place field changes, non-facetable, non-sortable or unindexed fields, missing `query_by`, unknown collections), and legacy `overrides.list` now points to the linked curation sets on Typesense v30.

### Patch Changes

- 0c94c19: Fix flag handling found in review: `--yes false` no longer confirms a destructive operation, `--params '{...}'` is used as the search/export params object (individual `--<param>` flags still override it), `--compact` output redacts credentials in collection schemas, and `collections.list --input '{"compact":true}' --compact` prints the compact result instead of an empty schema.
- 0c94c19: Reduce CLI startup work by lazily constructing command arguments and caching schema conversion. Restore live discovery in top-level help, explain common write and schema-repair workflows, and accept API key IDs as positional arguments.
- 0c94c19: Update dependencies to clear all `pnpm audit` advisories: Zod 4.6 (replacing Zod 3 and `zod-to-json-schema`, using Zod's built-in JSON Schema output), `@modelcontextprotocol/sdk` 1.32, and `typesense` 3.2, plus patched transitive versions of `follow-redirects`, `fast-uri`, `hono`, `@hono/node-server`, `body-parser`, `qs`, `ip-address`, `undici`, `sharp` and `source-map-js`. Validation error messages now use Zod 4's wording, and `--schema` output marks passthrough inputs with `additionalProperties: {}` (equivalent to `true`).

## 1.5.0

### Minor Changes

- 8567435: Update dependencies to patched versions. Emit complete CLI JSON Schemas and validate examples for every operation. Add explicit CLI-only `keys.create --reveal` output and isolate new Keychain credentials by unique references.

  Apply the shared execution limits to MCP resource reads and return failures as protocol errors. Limit document batches to 100 IDs and eight concurrent requests per batch, preserving input order and draining active requests on failure. Record successful tool audits only after response serialization succeeds.

### Patch Changes

- 8567435: Preserve MCP field definition inputs, retain concurrency slots for timed-out work until it settles, require confirmation for schema updates that drop fields, and prevent malformed HTTP Host headers from crashing the server. Prevent failed Keychain saves from printing API keys. Clarify credential setup and MCP execution limits.
- 8567435: Send document and stemming-dictionary imports with the correct text/plain content type so JSONL batches reach Typesense without JSON string encoding. Explicitly request text for document import/export responses. Add SDK transport regressions and a reusable live CLI/MCP integration test.

## 1.4.4

### Patch Changes

- 7c3eee5: Move package repository metadata and the MCP Registry identity to the TypesenseKit GitHub organization.

## 1.4.3

### Patch Changes

- 90c4ed3: Improve npm discovery metadata and link each package to its dedicated Typesense CLI or Typesense MCP product page.

## 1.4.1

### Patch Changes

- Fix the CLI package README formatting so usage guidance and command examples render correctly on npm.

## 1.4.0

### Minor Changes

- c7919af: Add hidden API-key prompting, stdin ingestion, and macOS Keychain-backed profiles.
- 3df75ce: Add profile connection testing plus validated, secret-safe profile import and export workflows.
- eaa9f0e: Render readable tables by default while preserving redacted JSON output for automation.
- 86b7fd6: Confirm destructive operations interactively and support explicit `--yes` automation.
- f86636c: Add Bash, Zsh, and Fish completion plus schema-derived examples for every operation.

## 1.2.0

### Minor Changes

- 71373eb: Add first-class Typesense cluster operations for schema status, snapshots, leader election, cache clearing, database compaction, and slow-request logging.
- 3859593: Add first-class Typesense v30 global curation set and curation item operations.
- b9ca3a8: Add first-class natural-language search model management and redact provider token and client-secret fields.
- fcd42e1: Add first-class operations for listing, retrieving, and importing Typesense stemming dictionaries.
- c72997f: Add current analytics rule creation and filtering, event retrieval, status, and flush operations.
- 7ef1669: Declare Typesense v30.2 compatibility and add registry-generated API coverage documentation.

## 1.1.3

### Patch Changes

- 6b1e5a3: Remove unsupported collection-scoped preset inputs and always use Typesense's global preset routes.
- a935f46: Fix stopword operations to use Typesense's global `/stopwords` API routes.
- 0b10ca9: Write profile configuration atomically with secure permissions and honor explicit profile selection ahead of environment credentials.
- dbb63a1: Update the locked production dependency graph to patched Axios, form-data, Hono, and qs releases.

## 1.1.2

### Patch Changes

- b81defe: Document scoped API key guidance, production MCP operations, and compatibility notes.
- 0ea7132: Add document batch retrieval, facet exploration, and search suggestion helper operations.

## 1.1.1

### Patch Changes

- f089920: Document the `documents.search` input shape with the required top-level `params` wrapper.
- 8882528: Add first-class global synonym set operations and guidance from collection synonym 404s.
- b8845bf: Add operation-level `--schema` and `--examples` helpers for discovering command input shapes.
- 09537c7: Fix `presets.create` to send the Typesense preset body as `{ value: ... }`.
- 7405426: Show concise network failure messages by default and add redacted CLI debug error details.
- df4ea1a: Redact API keys and auth headers from CLI and MCP error output.
- 3a316c7: Allow `api.call` to accept uppercase HTTP methods.

## 1.1.0

### Minor Changes

- Add safe collection schema update support, recursive output redaction, schema error hints, and collection field lifecycle commands.

## 1.0.0

### Major Changes

- Initial Release
