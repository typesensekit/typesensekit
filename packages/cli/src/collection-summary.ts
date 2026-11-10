import { redactSecrets } from "@typesensekit/core";

type Field = Record<string, unknown> & { name?: unknown; type?: unknown };
type Collection = Record<string, unknown> & {
  name?: unknown;
  fields?: unknown;
};

const NUMERIC = /^(?:int32|int64|float|bool)(?:\[\])?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The flags worth reading in a field definition; defaults are left out. */
function fieldFlags(field: Field): string[] {
  const flags: string[] = [];
  if (field.facet === true) flags.push("facet");
  if (field.sort === true) flags.push("sort");
  if (field.index === false) flags.push("index:false");
  if (field.optional === true) flags.push("optional");
  if (field.infix === true) flags.push("infix");
  if (field.stem === true) flags.push("stem");
  if (typeof field.locale === "string" && field.locale)
    flags.push(`locale:${field.locale}`);
  if (typeof field.reference === "string" && field.reference)
    flags.push(`reference:${field.reference}`);
  if (typeof field.num_dim === "number" && field.num_dim)
    flags.push(`num_dim:${field.num_dim}`);
  if (isRecord(field.embed)) flags.push(`embed:${JSON.stringify(field.embed)}`);
  return flags;
}

function names(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** A collection schema reduced to what agents and people read most. */
export function compactCollection(
  collection: Collection,
  aliases: string[] = [],
): Record<string, unknown> {
  const fields = (Array.isArray(collection.fields) ? collection.fields : [])
    .filter(isRecord)
    .map((field) => {
      const compact: Record<string, unknown> = {
        name: field.name,
        type: field.type,
      };
      for (const key of ["facet", "sort", "index", "optional"]) {
        if (typeof field[key] === "boolean") compact[key] = field[key];
      }
      for (const key of [
        "infix",
        "stem",
        "locale",
        "reference",
        "num_dim",
        "embed",
      ]) {
        const value = field[key];
        if (value !== undefined && value !== false && value !== "")
          compact[key] = value;
      }
      return compact;
    });
  return {
    name: collection.name,
    num_documents: collection.num_documents,
    ...(aliases.length ? { aliases } : {}),
    default_sorting_field: collection.default_sorting_field || undefined,
    ...(names(collection.synonym_sets).length
      ? { synonym_sets: names(collection.synonym_sets) }
      : {}),
    ...(names(collection.curation_sets).length
      ? { curation_sets: names(collection.curation_sets) }
      : {}),
    ...(collection.enable_nested_fields === true
      ? { enable_nested_fields: true }
      : {}),
    fields,
  };
}

/** Plain-text overview: one header line per collection, one line per field. */
export function renderCollectionSummary(
  collection: Collection,
  aliases: string[] = [],
): string {
  const header = [
    `${String(collection.name)}: ${String(collection.num_documents ?? "?")} documents`,
    aliases.length ? `aliases: ${aliases.join(", ")}` : "",
    collection.default_sorting_field
      ? `default_sorting_field: ${String(collection.default_sorting_field)}`
      : "",
    names(collection.synonym_sets).length
      ? `synonym_sets: ${names(collection.synonym_sets).join(", ")}`
      : "",
    names(collection.curation_sets).length
      ? `curation_sets: ${names(collection.curation_sets).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const fields = (Array.isArray(collection.fields) ? collection.fields : [])
    .filter(isRecord)
    .map((field) => {
      const flags = fieldFlags(field);
      return `  ${String(field.name)}: ${String(field.type)}${flags.length ? ` [${flags.join(", ")}]` : ""}`;
    });
  return [header, ...fields].join("\n");
}

/** Maps collection name to the aliases that point at it. */
export function aliasesByCollection(aliases: unknown): Map<string, string[]> {
  const rows = isRecord(aliases) ? aliases.aliases : aliases;
  const map = new Map<string, string[]>();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isRecord(row)) continue;
    const { name, collection_name: target } = row;
    if (typeof name !== "string" || typeof target !== "string") continue;
    map.set(target, [...(map.get(target) ?? []), name]);
  }
  return map;
}

export function renderCollectionsCompact(
  rawResult: unknown,
  aliases: Map<string, string[]>,
  json: boolean,
): string {
  // Schemas can carry credentials (e.g. embed.model_config.api_key).
  const result = redactSecrets(rawResult);
  // `collections.list {compact:true}` already returns core's compact
  // envelope ({collections: [...]}); print it as-is instead of reading it
  // as a single collection schema.
  if (
    isRecord(result) &&
    Array.isArray(result.collections) &&
    !("fields" in result)
  ) {
    return JSON.stringify(result, null, json ? undefined : 2);
  }
  const collections = (Array.isArray(result) ? result : [result]).filter(
    isRecord,
  );
  if (json) {
    const compact = collections.map((collection) =>
      compactCollection(collection, aliases.get(String(collection.name))),
    );
    return JSON.stringify(Array.isArray(result) ? compact : compact[0]);
  }
  if (!collections.length) return "No collections.";
  const legend =
    "Flags: facet = usable in facet_by; sort = usable in sort_by; index:false = cannot be searched, filtered, faceted or sorted; optional = may be missing. Any indexed field can be filtered.";
  return [
    ...collections.map((collection) =>
      renderCollectionSummary(collection, aliases.get(String(collection.name))),
    ),
    legend,
  ].join("\n");
}

/** Searchable fields line used in error hints about unknown fields. */
export function fieldsHint(collection: Collection): string {
  const fields = (Array.isArray(collection.fields) ? collection.fields : [])
    .filter(isRecord)
    .filter((field) => field.name !== ".*");
  const describe = (field: Field) => {
    const flags = fieldFlags(field).filter((flag) =>
      ["facet", "sort", "index:false"].includes(flag),
    );
    return `${String(field.name)} (${String(field.type)}${flags.length ? `, ${flags.join(", ")}` : ""})`;
  };
  const text = fields
    .filter(
      (field) =>
        typeof field.type === "string" &&
        !NUMERIC.test(field.type) &&
        field.type.startsWith("string"),
    )
    .map((field) => String(field.name));
  return [
    `Fields of ${String(collection.name)}: ${fields.map(describe).join(", ")}.`,
    text.length ? `Text fields for query_by: ${text.join(",")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
