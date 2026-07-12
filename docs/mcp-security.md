# MCP Security and Operations

TypesenseKit's MCP server defaults to read-only tools. Keep that default for
assistant workflows unless the MCP client is running in a trusted operator-only
environment.

## API Key Scope

Use the narrowest Typesense API key that supports the tools you plan to expose.
Typesense supports per-action and per-collection key scopes. Its API key docs
recommend avoiding bootstrap/admin keys in production and generating scoped keys
for each application.

Minimal search-only key:

```json
{
  "description": "typesensekit-mcp-search",
  "actions": ["documents:search"],
  "collections": ["products"]
}
```

Search plus document and collection metadata:

```json
{
  "description": "typesensekit-mcp-read",
  "actions": [
    "documents:search",
    "documents:get",
    "documents:export",
    "collections:get",
    "collections:list",
    "aliases:get",
    "aliases:list",
    "synonyms:get",
    "synonyms:list",
    "synonym_sets:get",
    "synonym_sets:list",
    "synonym_sets/items:get",
    "synonym_sets/items:list",
    "stopwords:get",
    "stopwords:list",
    "presets:get",
    "presets:list",
    "metrics.json:list",
    "stats.json:list",
    "debug:list"
  ],
  "collections": ["products"]
}
```

Notes:

- Do not use the bootstrap key or an admin key for assistant access.
- Keep `TYPESENSEKIT_READ_ONLY` unset or set to `true` for normal MCP clients.
- Set `TYPESENSEKIT_READ_ONLY=false` only for trusted maintenance sessions.
- Do not expose `keys:*`, write actions, or wildcard `*` actions to agents.
- Scope `collections` to concrete collection names or narrow regexes.
- If user-specific filtering is required, generate scoped search keys from a
  parent key that only has `documents:search`.

## Environment

Required:

```sh
TYPESENSE_URL=https://your-cluster.typesense.net
TYPESENSE_API_KEY=your-scoped-api-key
```

Optional:

```sh
TYPESENSE_CONNECTION_TIMEOUT_SECONDS=5
TYPESENSEKIT_READ_ONLY=true
TYPESENSEKIT_MCP_BEARER_TOKEN=replace-with-a-long-random-token
TYPESENSEKIT_MCP_TOOL_TIMEOUT_MS=30000
TYPESENSEKIT_MCP_MAX_CONCURRENCY=8
TYPESENSEKIT_MCP_RATE_LIMIT_PER_MINUTE=120
TYPESENSEKIT_MCP_MAX_RESPONSE_BYTES=1048576
```

## Production Guidance

- Run the MCP server in read-only mode by default.
- Keep HTTP on loopback or configure bearer authentication before binding to a
  non-loopback interface.
- Prefer a dedicated API key per MCP deployment so it can be rotated without
  impacting application traffic.
- Set a short Typesense connection timeout for assistant workflows. Long
  timeouts make tool calls harder to cancel and retry.
- Apply rate limits at the MCP client, process supervisor, reverse proxy, or
  container platform boundary. TypesenseKit does not currently enforce per-tool
  rate limits inside the stdio server.
- Capture process stdout/stderr from the supervisor. Tool results are returned to
  the MCP client, and TypesenseKit redacts API keys, auth headers, cookies, and
  generated key values from tool output and errors.
- Treat `documents.export` as sensitive. It is read-only, but it can return a
  large amount of data if the API key and collection scope allow it.

## Compatibility

| TypesenseKit MCP version | Typesense client | Typesense server guidance |
| --- | --- | --- |
| 1.1.x | `typesense` npm package `^3.0.6` | Initial v27-oriented operation set with selected v30 global synonym support. |
| 1.2.x | `typesense` npm package `^3.0.6` | Targets Typesense v30.2 first-class APIs. Retains collection-level `synonyms.*` and `overrides.*` for v27-v29 compatibility and migrations. |

TypesenseKit also exposes `api.call` when read-only mode is disabled, so newer
Typesense endpoints can still be reached before a first-class operation is
added. Keep `api.call` disabled for assistant-facing read-only deployments.

## References

- Typesense API keys: https://typesense.org/docs/30.2/api/api-keys.html
- Typesense data access control: https://typesense.org/docs/guide/data-access-control.html
