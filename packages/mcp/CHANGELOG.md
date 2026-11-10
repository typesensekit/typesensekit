# @typesensekit/mcp

## 1.6.0

### Minor Changes

- 0c94c19: Help AI agents finish Typesense tasks in fewer calls:

  - MCP tools now carry agent-oriented descriptions, and the server sends instructions covering discovery, search parameters, filter syntax, facets, synonym and curation sets, and schema changes.
  - `search`, `documents.search` and `documents.export` document common Typesense parameters (`q`, `query_by`, `filter_by`, `sort_by`, `facet_by`, `per_page`, ...) while still accepting any other parameter.
  - New optional `compact: true` on `search`, `documents.search` and `multi_search` returns hits as `{document}` only, without highlight and text-match metadata (`compact` inside `params` or a multi-search entry is honored too).
  - New `documents.delete_by_filter`, `documents.update_by_filter` and `documents.copy` (server-side copy between collections, for reindexing) operations, full access only.
  - `collections.fields.*` expose `facet`, `sort`, `index`, `optional`, `infix`, `stem` and `locale` in their schemas; `collections.fields.replace` defaults `type` to the field's current type.
  - MCP errors add hints for common Typesense failures (in-place field changes, non-facetable, non-sortable or unindexed fields, missing `query_by`, unknown collections), and legacy `overrides.list` now points to the linked curation sets on Typesense v30.

### Patch Changes

- 0c94c19: Reduce MCP context overhead:

  - Tool listings are about 40% smaller than in 1.5 (read-only 23.6k → 14.9k chars). They drop `$schema`, `additionalProperties: false` and descriptions that repeat the server instructions; `collections.fields.drop` only advertises its real inputs; rarely used vector and wait options are named instead of typed. Calls are still validated against the full input schemas.
  - Tool guidance is more concise, and JSON responses are unindented (lossless).
  - New opt-in `collections.list {compact: true}`: one call returns every collection's fields as `name: type [non-default flags]`, its aliases, linked synonym and curation sets, and `text_fields` (candidates for `query_by`). Full schemas and search defaults are unchanged.
  - Errors about field flags (facet, sort, filter, non-indexed, missing `query_by`) list the collection's fields, and `collections.fields.replace` returns `num_documents`.

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

## 1.4.2

### Patch Changes

- Add official MCP Registry ownership metadata and an `mcp` executable alias for registry clients.

## 1.3.0

### Minor Changes

- 8681b76: Add secret-safe structured tool auditing, consistent resource redaction, and real HTTP and stdio transport verification.
- 3323c2e: Add process-wide MCP tool timeouts, concurrency and rate limits, and bounded serialized responses.
- e57268d: Return structured MCP results and publish read-only, destructive, idempotent, and open-world tool annotations.
- 65c719d: Secure Streamable HTTP with loopback binding, Origin validation, bearer authentication, non-loopback startup safeguards, and bounded request bodies.

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
- dbb63a1: Update the locked production dependency graph to patched Axios, form-data, Hono, and qs releases.

## 1.1.2

### Patch Changes

- b81defe: Document scoped API key guidance, production MCP operations, and compatibility notes.
- 914695b: Add a stateless Streamable HTTP MCP entrypoint plus Docker and end-to-end assistant search documentation.
- 1175037: Expose MCP resources for operation discovery, read-only tool discovery, collection schemas, and document lookup.
- 0ea7132: Add document batch retrieval, facet exploration, and search suggestion helper operations.
- be5d62d: Default MCP tools to read-only mode with an explicit opt out for write/admin operations.

## 1.1.1

### Patch Changes

- 8882528: Add first-class global synonym set operations and guidance from collection synonym 404s.
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
