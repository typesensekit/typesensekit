# TypesenseKit

![TypesenseKit GitHub hero banner](./assets/github-hero.png)

[![CI](https://github.com/akshitkrnagpal/typesensekit/actions/workflows/ci.yml/badge.svg)](https://github.com/akshitkrnagpal/typesensekit/actions/workflows/ci.yml)

TypesenseKit is the developer toolkit for operating Typesense from terminals and AI agents. It gives you one typed operation registry, a human-friendly CLI, and an MCP stdio server over the same Typesense Admin API surface.

Use it when you want repeatable Typesense automation without rebuilding small scripts for every collection, import, search, schema update, or agent workflow.

## What You Get

- [`@typesensekit/cli`](https://www.npmjs.com/package/@typesensekit/cli): a `tsk` command for profile-aware Typesense operations, raw API calls, and agent config snippets.
- [`@typesensekit/mcp`](https://www.npmjs.com/package/@typesensekit/mcp): an MCP stdio server that exposes Typesense operations as tools for compatible agents.
- `@typesensekit/core`: the private shared client, operation registry, validation layer, and redaction utilities used by both public packages.

## Quick Start

Install the CLI:

```sh
pnpm add -g @typesensekit/cli
```

Create and use a profile:

```sh
tsk profile add local --url http://localhost:8108 --api-key xyz
tsk profile use local
tsk collections.list --input '{}'
```

Or run without a saved profile:

```sh
TYPESENSE_URL=http://localhost:8108 TYPESENSE_API_KEY=xyz tsk health --input '{}'
```

List every supported operation:

```sh
tsk operations
```

Inspect an operation's input shape before running it:

```sh
tsk documents.search --schema
tsk documents.search --examples
```

Search parameters are passed inside the top-level `params` object:

```sh
tsk documents.search --input '{"collection":"production__products","params":{"q":"*","query_by":"q"}}' --json
```

## MCP Server

Run the MCP stdio server directly:

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

Generate copy-ready integration snippets from the CLI:

```sh
tsk skills mcp
tsk skills claude-desktop
tsk skills claude-code
tsk skills hermes
```

## API Coverage

TypesenseKit covers the common Typesense administration and search surfaces, plus `api.call` for endpoints that are new, uncommon, or not yet wrapped.

| Area | Operations |
| --- | --- |
| Collections | list, get, create, update, delete, schema changes |
| Documents | index, upsert, get, update, delete, import, export, search |
| Search | search, multi-search |
| Configuration | aliases, synonyms, overrides, stopwords, presets |
| Access | API keys |
| Analytics | rules and events |
| Conversations | models and history |
| System | health, metrics, stats, debug |
| Escape hatch | raw HTTP calls through `api.call` |

Typesense v30 global synonym sets are available through `synonym_sets.*`:

```sh
tsk synonym_sets.list --input '{}' --json
tsk synonym_sets.items.list --input '{"name":"products-core"}' --json
```

## Why It Exists

Typesense work often jumps between dashboards, one-off scripts, local curl commands, and agent experiments. TypesenseKit keeps those workflows on one command and one tool registry:

- Use the same operation names from the CLI and MCP server.
- Keep API keys out of command history with saved profiles or environment variables.
- Get structured input validation before requests hit Typesense.
- Redact secrets in error output.
- Fall back to raw API calls when Typesense ships faster than the wrappers.

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

Useful scripts:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:dry
```

## Repository Assets

- README banner: [`assets/github-hero.png`](./assets/github-hero.png)
- GitHub social preview image: [`assets/github-og.png`](./assets/github-og.png)

Use `assets/github-og.png` as the repository social preview in GitHub settings.

## Releasing

```sh
pnpm changeset
pnpm changeset version
pnpm release
```

## Contributing

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, development rules, and release notes.

## License

MIT
