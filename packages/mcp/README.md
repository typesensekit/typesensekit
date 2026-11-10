# @typesensekit/mcp

An open-source Typesense MCP server that gives AI agents structured tools for
search, schema inspection, collection operations, and cluster administration.
It runs in read-only mode by default.

**[Typesense MCP overview](https://typesensekit.vercel.app/typesense-mcp/)** ·
**[Client setup](https://typesensekit.vercel.app/guides/clients/)** ·
**[Security guide](https://typesensekit.vercel.app/guides/mcp/)** ·
**[GitHub](https://github.com/typesensekit/typesensekit)**

```sh
TYPESENSE_URL=http://localhost:8108 TYPESENSE_API_KEY=xyz pnpm dlx @typesensekit/mcp
```

Set `TYPESENSEKIT_READ_ONLY=false` to expose write/delete/admin tools.

Run the stateless Streamable HTTP server:

```sh
TYPESENSE_URL=http://localhost:8108 TYPESENSE_API_KEY=xyz pnpm dlx --package @typesensekit/mcp typesensekit-mcp-http
```

See the [API coverage inventory](https://github.com/typesensekit/typesensekit/blob/main/docs/api-coverage.md)
for supported Typesense operations.

For smaller agent contexts, use `collections.list` with `{"compact":true}`.
It returns `{collections, aliases}`: collection names, document counts, field
names/types and facet/sort/index/optional flags, default sorting fields, linked
synonym/curation sets, and alias mappings. This mode reads both `/collections`
and `/aliases`; the API key needs access to both. Use `collections.retrieve`
for details such as embedding, locale, or tokenization settings. Omitting
`compact` keeps the full collection schema array.

For document searches, prefer `search` with `compact:true` and
`params.include_fields` when highlights and match scores are unnecessary.
`documents.search` remains an equivalent alias. Search output defaults are
unchanged; JSON text responses use no indentation and preserve the same data.
