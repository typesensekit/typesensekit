# @typesensekit/cli

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
