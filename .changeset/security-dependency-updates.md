---
"@typesensekit/cli": patch
"@typesensekit/mcp": patch
---

Update dependencies to clear all `pnpm audit` advisories: Zod 4.6 (replacing Zod 3 and `zod-to-json-schema`, using Zod's built-in JSON Schema output), `@modelcontextprotocol/sdk` 1.32, and `typesense` 3.2, plus patched transitive versions of `follow-redirects`, `fast-uri`, `hono`, `@hono/node-server`, `body-parser`, `qs`, `ip-address`, `undici`, `sharp` and `source-map-js`. Validation error messages now use Zod 4's wording, and `--schema` output marks passthrough inputs with `additionalProperties: {}` (equivalent to `true`).
