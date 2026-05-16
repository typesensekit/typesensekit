# TypesenseKit

TypesenseKit is a pnpm monorepo for Typesense automation. It ships two public packages:

- `@typesensekit/cli`, a human-friendly CLI for Typesense Admin API operations, profile management, and agent skill snippets.
- `@typesensekit/mcp`, an MCP stdio server that exposes the same Typesense operations as tools.

`@typesensekit/core` is a private workspace package that owns the shared Typesense client and operation registry.

## API coverage

The shared registry covers the main Typesense API surfaces and includes a raw `api.call` escape hatch for new or uncommon endpoints:

- Collections and collection schema updates
- Documents: index, upsert, get, update, delete, import, export, search
- Search and multi-search
- Aliases
- Synonyms
- Overrides
- Stopwords
- Presets
- API keys
- Analytics rules and analytics events
- Conversations models and history
- Health, metrics, stats, and debug endpoints
- Raw HTTP calls through `api.call`

## Install

```sh
pnpm add -g @typesensekit/cli
pnpm dlx @typesensekit/mcp
```

## CLI

Configure a profile:

```sh
tsk profile add local --url http://localhost:8108 --api-key xyz
tsk profile use local
tsk collections.list --input '{}'
```

Or use env vars instead of a saved profile:

```sh
TYPESENSE_URL=http://localhost:8108 TYPESENSE_API_KEY=xyz tsk health --input '{}'
```

List operations:

```sh
tsk operations
```

Generate integration snippets:

```sh
tsk skills mcp
tsk skills claude-desktop
tsk skills claude-code
tsk skills hermes
```

## MCP

Run the stdio server:

```sh
TYPESENSE_URL=http://localhost:8108 TYPESENSE_API_KEY=xyz pnpm dlx @typesensekit/mcp
```

Claude Desktop example:

```json
{
  "mcpServers": {
    "typesensekit": {
      "command": "npx",
      "args": ["-y", "@typesensekit/mcp"],
      "env": {
        "TYPESENSE_URL": "http://localhost:8108",
        "TYPESENSE_API_KEY": "xyz"
      }
    }
  }
}
```

## Development

```sh
corepack enable
pnpm install
pnpm check
```

Run local Typesense:

```sh
docker run -p 8108:8108 \
  -e TYPESENSE_API_KEY=xyz \
  -e TYPESENSE_DATA_DIR=/data \
  typesense/typesense:27.1 --enable-cors
```

## Publishing

The repo starts private. Publish packages publicly with changesets once the code is ready:

```sh
pnpm changeset
pnpm changeset version
pnpm release
```

## License

MIT
