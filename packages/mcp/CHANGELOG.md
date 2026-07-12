# @typesensekit/mcp

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
