# Contributing

## Setup

Use Node.js 22.12 or newer to build the workspace, including the Astro site.

```sh
corepack enable
pnpm install
pnpm check
```

## Development rules

- Keep the operation registry in `packages/core/src/operations` as the source of truth.
- Add or update tests with behavior changes.
- Run `pnpm check` before opening a PR.
- Use changesets for publishable package changes.

## Releasing

```sh
pnpm changeset
pnpm changeset version
pnpm release
```

## Live integration testing

Build the workspace and Docker image, then run a disposable Typesense 30.2
instance and an authenticated TypesenseKit MCP HTTP container connected to it.
Do not point this test at production. It creates and removes a temporary
collection and a scoped API key.

Set connection variables to the mapped localhost ports of those containers:

```sh
export TYPESENSEKIT_TEST_URL=http://127.0.0.1:8108
export TYPESENSEKIT_TEST_API_KEY=your-disposable-cluster-key
export TYPESENSEKIT_TEST_MCP_URL=http://127.0.0.1:3000/mcp
export TYPESENSEKIT_TEST_MCP_TOKEN=your-test-http-token
pnpm --filter @typesensekit/mcp test:live
```

This checks CLI import/export and search, batch ordering, schema confirmation,
scoped keys, explicit profiles, stdio MCP, and authenticated HTTP tools/resources.
Stop and remove the disposable containers after testing.
