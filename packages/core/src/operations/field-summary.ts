/**
 * Dense, human- and agent-readable summaries of collection fields:
 * `name: type [flags]`, listing only non-default flags so the ones that
 * matter (facet, sort, index:false) stand out.
 */

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-default flags of a field definition, in a stable order. */
export function fieldFlags(field: Record_): string[] {
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
  if (isRecord(field.embed) && Array.isArray(field.embed.from))
    flags.push(`embed_from:${field.embed.from.join("+")}`);
  return flags;
}

/** `price: float [facet, sort]`, or `title: string` when all flags are default. */
export function fieldSummary(field: unknown): string {
  if (!isRecord(field)) return String(field);
  const flags = fieldFlags(field);
  return `${String(field.name)}: ${String(field.type)}${flags.length ? ` [${flags.join(", ")}]` : ""}`;
}

function collectionFields(collection: unknown): Record_[] {
  return isRecord(collection) && Array.isArray(collection.fields)
    ? collection.fields.filter(isRecord)
    : [];
}

/** Indexed string fields, i.e. what a text query can use in query_by. */
export function textFieldNames(collection: unknown): string[] {
  return collectionFields(collection)
    .filter(
      (field) =>
        typeof field.type === "string" &&
        field.type.startsWith("string") &&
        field.index !== false &&
        typeof field.name === "string" &&
        !field.name.includes("*"),
    )
    .map((field) => String(field.name));
}

/**
 * Two-line hint listing a collection's fields with flags and its query_by
 * candidates; used in error messages so agents can fix a request without a
 * separate schema lookup.
 */
export function collectionFieldsHint(collection: unknown): string | undefined {
  const fields = collectionFields(collection);
  if (!fields.length || !isRecord(collection)) return undefined;
  const text = textFieldNames(collection);
  return [
    `Fields of ${String(collection.name)}: ${fields.map(fieldSummary).join("; ")}.`,
    text.length ? `Text fields for query_by: ${text.join(",")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
