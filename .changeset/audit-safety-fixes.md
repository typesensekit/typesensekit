---
"@typesensekit/cli": patch
"@typesensekit/mcp": patch
---

Preserve MCP field definition inputs, retain concurrency slots for timed-out work until it settles, require confirmation for schema updates that drop fields, and prevent malformed HTTP Host headers from crashing the server. Prevent failed Keychain saves from printing API keys. Clarify credential setup and MCP execution limits.
