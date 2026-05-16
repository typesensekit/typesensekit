# Contributing

## Setup

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
