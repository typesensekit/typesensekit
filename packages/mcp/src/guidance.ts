/**
 * Agent-facing guidance: MCP server instructions and error hints that name
 * MCP tools and input fields (the CLI has its own `tsk ...` hints in core).
 */

const SHARED_INSTRUCTIONS = [
  "Typesense tools use dotted names (some clients show underscores).",
  "Discovery: start with collections.list {compact:true} for collection names, counts, field types/flags, linked sets and aliases in one call. Use collections.retrieve for full schema details. All collection arguments accept aliases; match the user's alias when present.",
  "Search: prefer search (documents.search is an alias), compact:true and include_fields unless you need highlights/scores. params use snake_case. q:'*' matches all; other queries need query_by string fields. found is total matches, hits one page (default 10, per_page max 250); use per_page:0 for counts/facets, page for more hits. multi_search batches independent searches.",
  "filter_by: exact field:=value, list field:[a,b], range year:[1990..1999], comparisons, &&/||. Backtick-quote spaces/special characters: brand:=`Smith & Co`.",
  "Facets require facet:true. max_facet_values (maxFacetValues in search.facets) defaults to 10; raise for all values. Numeric facet stats min/max/sum/avg cover every matching document; total_values counts distinct values only. Use facets/group_by instead of dumping documents for aggregates.",
  "Synonym expansion and pinned/hidden hits apply by default; disable with enable_synonyms:false / enable_overrides:false for raw matches. On v30+, use global synonym_sets/curation_sets linked in collection schemas; synonyms/overrides tools are legacy v29.",
];

const WRITE_INSTRUCTIONS = [
  "Schema changes: collections.fields.replace changes existing facet/sort/index/optional/type flags. Pass the full desired definition (omitted flags reset); type defaults to existing. Stored values are re-indexed without export/import. collections.update only adds/drops fields.",
  "Bulk: documents.delete_by_filter/update_by_filter affect all matches; documents.import loads batches; documents.copy copies between collections server-side for reindexing before repointing aliases.",
  "presets.create and synonym_sets.create replace whole values. Add individual rules with synonym_sets.items.create / curation_sets.items.upsert.",
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
