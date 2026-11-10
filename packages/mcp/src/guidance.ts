/**
 * Agent-facing guidance: MCP server instructions and error hints that name
 * MCP tools and input fields (the CLI has its own `tsk ...` hints in core).
 */

const SHARED_INSTRUCTIONS = [
  "TypesenseKit gives you Typesense tools. Tool names use dots (some clients show them with underscores, e.g. collections_list).",
  "",
  "Discovery",
  "- Don't guess collection or field names. collections.list returns every collection's full schema (field types, facet/sort/index flags, num_documents, linked synonym_sets and curation_sets) in one call; aliases.list maps alias names to collections. Tools accept alias names wherever they take a collection.",
  "",
  "Searching (search; documents.search is the same tool)",
  "- params are Typesense search parameters in snake_case: q, query_by, filter_by, sort_by, facet_by, per_page, page, include_fields, group_by.",
  "- q: '*' matches everything and needs no query_by. Any other q needs query_by (string fields).",
  "- `found` is the total match count; hits hold one page (default 10, max per_page 250). For counts use per_page: 0. For more than 250 hits, page through or narrow with filter_by.",
  "- filter_by: field:=value (exact), field:[a,b] (any of), price:<100, year:[1990..1999] (range), && / ||. Backtick-quote values containing spaces or special characters such as & , ( ): brand:=`Smith & Co`.",
  "- Facets: only the top 10 values per field come back unless you set max_facet_values (search) or maxFacetValues (search.facets). Numeric facet fields also return stats (min, max, sum, avg), which answers totals and averages without reading documents.",
  "- Results include synonym expansion and curation rules (pinned or hidden hits). To see raw matches, set enable_synonyms: false or enable_overrides: false.",
  "- Full hits carry highlight and scoring metadata (~0.5 KB per hit). When reading more than a few hits, set compact: true and include_fields so large pages fit in your context. Use multi_search to run several independent searches in one call.",
  "",
  "Synonyms and curation",
  "- On Typesense v30+, synonyms and curation rules live in global synonym_sets and curation_sets, linked from each collection's schema. The synonyms.* and overrides.* tools are legacy (Typesense v29 and earlier).",
];

const WRITE_INSTRUCTIONS = [
  "",
  "Changing data and schemas",
  "- Typesense cannot modify an existing field in place. To change a field's facet, sort, index, optional or type setting, use collections.fields.replace with the full desired definition. Stored values are re-indexed, so no export or re-import is needed. Use collections.update only to add new fields or drop fields.",
  "- Bulk changes: documents.delete_by_filter and documents.update_by_filter change every match in one call; documents.import loads many documents at once; documents.copy copies documents between collections on the server (e.g. reindexing into a new schema before repointing an alias), so you never have to re-send them.",
  "- presets.create and synonym_sets.create replace the whole value. To add one rule, use synonym_sets.items.create or curation_sets.items.upsert.",
];

const READ_ONLY_NOTE = [
  "",
  "This server is read-only: it has no tools that create, change, or delete data.",
];

export function serverInstructions(readOnly: boolean): string {
  return [
    ...SHARED_INSTRUCTIONS,
    ...(readOnly ? READ_ONLY_NOTE : WRITE_INSTRUCTIONS),
  ].join("\n");
}

type HintContext = {
  operation: string;
  input: unknown;
  readOnly: boolean;
};

function inputField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/** Returns a short, actionable next step for common Typesense errors. */
export function mcpErrorHint(
  message: string,
  { operation, input, readOnly }: HintContext,
): string | undefined {
  const collection = inputField(input, "collection");
  const schemaHint = collection
    ? `collections.retrieve {"collection": "${collection}"}`
    : "collections.list";

  if (/already part of the schema/i.test(message)) {
    const field = /Field `([^`]+)`/.exec(message)?.[1];
    return `Typesense cannot change an existing field in place. Use collections.fields.replace {"collection": ..., "field": "${field ?? "<name>"}", plus the flags you want, e.g. "facet": true, "sort": true, "index": true, "optional": true}. It drops and re-adds the field, and Typesense re-indexes the stored values, so no export or import is needed.`;
  }

  const facet = /Could not find a facet field named `([^`]+)`/i.exec(message);
  if (facet) {
    return `\`${facet[1]}\` is not a facet field: only fields with facet: true can be used in facet_by. Check ${schemaHint}.${readOnly ? "" : " To make it facetable, use collections.fields.replace with facet: true."}`;
  }

  const filter = /Could not find a filter field named `([^`]+)`/i.exec(message);
  if (filter) {
    return `\`${filter[1]}\` is missing from the schema or not indexed (index: false), so it cannot be filtered. Check ${schemaHint}.${readOnly ? "" : " To index it, use collections.fields.replace with index: true."}`;
  }

  const sort =
    /Could not find a field named `([^`]+)` in the schema for sorting/i.exec(
      message,
    );
  if (sort) {
    return `\`${sort[1]}\` is not sortable: sort_by needs a numeric field or a field with sort: true. Check ${schemaHint}.${readOnly ? "" : " To make it sortable, use collections.fields.replace with sort: true."}`;
  }

  if (/No search fields specified/i.test(message)) {
    return "Add query_by with the string fields to search (e.g. query_by: 'title,description'), or use q: '*' to match all documents.";
  }

  if (/Only upto 250 hits can be fetched per page/i.test(message)) {
    return "per_page is capped at 250. Use page to fetch more, filter_by to narrow, per_page: 0 to only count, or facets for aggregates.";
  }

  if (/Collection not found/i.test(message)) {
    return "Use collections.list or aliases.list for exact names; alias names are accepted wherever a collection is.";
  }

  if (
    /exceeding the \d+-byte limit/i.test(message) &&
    /search/.test(operation)
  ) {
    return "Shrink the response with compact: true, include_fields, a smaller per_page, or facets instead of hits.";
  }

  return undefined;
}

export function formatMcpError(message: string, context: HintContext): string {
  const hint = mcpErrorHint(message, context);
  return hint ? `${message}\nHint: ${hint}` : message;
}
