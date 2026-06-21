# @typesensekit/mcp

MCP stdio server exposing Typesense API operations as tools. It runs in
read-only mode by default for assistant use cases.

```sh
TYPESENSE_URL=http://localhost:8108 TYPESENSE_API_KEY=xyz pnpm dlx @typesensekit/mcp
```

Set `TYPESENSEKIT_READ_ONLY=false` to expose write/delete/admin tools.

See the root README for client configuration, security guidance, and operation
coverage.
