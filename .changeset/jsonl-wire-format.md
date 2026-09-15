---
"@typesensekit/cli": patch
"@typesensekit/mcp": patch
---

Send document and stemming-dictionary imports with the correct text/plain content type so JSONL batches reach Typesense without JSON string encoding. Explicitly request text for document import/export responses. Add SDK transport regressions and a reusable live CLI/MCP integration test.
