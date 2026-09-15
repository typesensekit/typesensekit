---
"@typesensekit/cli": minor
"@typesensekit/mcp": minor
---

Update dependencies to patched versions. Emit complete CLI JSON Schemas and validate examples for every operation. Add explicit CLI-only `keys.create --reveal` output and isolate new Keychain credentials by unique references.

Apply the shared execution limits to MCP resource reads and return failures as protocol errors. Limit document batches to 100 IDs and eight concurrent requests per batch, preserving input order and draining active requests on failure. Record successful tool audits only after response serialization succeeds.
