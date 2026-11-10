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
It returns `{collections}`: per collection the document count, aliases,
default sorting field, linked synonym/curation sets, `text_fields` (indexed
string fields to use in `query_by`), and fields as
`name: type [flags]` strings that list only non-default flags (for example
`price: float [facet, sort]` or `notes: string [index:false, optional]`).
Aliases whose target collection is missing are returned under `aliases`.
This mode reads both `/collections` and `/aliases`; the API key needs access
to both. Use `collections.retrieve` for full field definitions. Omitting
`compact` keeps the full collection schema array.

Tool listings are compact: they omit `$schema`, `additionalProperties: false`
and descriptions that repeat the server instructions, and name rarely used
options (vector settings on `collections.fields.*`) in the description
instead of typing them. Calls are still validated against the full input
schemas, so every documented input is accepted. Errors about a field's
schema flags (facet, sort, index, missing `query_by`) list the collection's
fields and text fields so the request can be fixed without another lookup.

For document searches, prefer `search` with `compact:true` and
`params.include_fields` when highlights and match scores are unnecessary.
`documents.search` remains an equivalent alias. Search output defaults are
unchanged; JSON text responses use no indentation and preserve the same data.
