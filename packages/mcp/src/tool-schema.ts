/**
 * The tool definitions MCP clients resend to the model on every turn.
 * These helpers keep them small without changing what a tool accepts: the
 * server still validates calls with each operation's full zod schema, so
 * hidden or collapsed properties stay valid inputs.
 */

import { FILTER_BY_HELP } from "@typesensekit/core";

export type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Property descriptions that only restate the property name, or repeat
 * guidance already in the server instructions (filter_by syntax, alias
 * support). `search` keeps the filter_by syntax next to its params.
 */
const REDUNDANT_DESCRIPTIONS = new Set([
  "Collection name or alias.",
  "Collection name.",
  "Field name.",
  FILTER_BY_HELP,
]);

/**
 * Drops JSON Schema noise that does not help a model call the tool:
 * `$schema`, `additionalProperties: false`, value schemas for extra keys
 * (reduced to `additionalProperties: true`) and, unless `keepDescriptions`,
 * redundant property descriptions.
 */
export function slimJsonSchema(
  schema: unknown,
  keepDescriptions = false,
): unknown {
  if (Array.isArray(schema))
    return schema.map((entry) => slimJsonSchema(entry, keepDescriptions));
  if (!isRecord(schema)) return schema;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema") continue;
    if (
      key === "description" &&
      !keepDescriptions &&
      typeof value === "string" &&
      REDUNDANT_DESCRIPTIONS.has(value)
    )
      continue;
    if (key === "additionalProperties") {
      if (value === false) continue;
      result[key] = true;
      continue;
    }
    if (key === "properties" && isRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, property]) => [
          name,
          slimJsonSchema(property, keepDescriptions),
        ]),
      );
      continue;
    }
    result[key] = slimJsonSchema(value, keepDescriptions);
  }
  return result;
}

const VECTOR_FIELD_OPTIONS = [
  "numDim",
  "vecDist",
  "hnswM",
  "hnswEfConstruction",
  "embedFrom",
  "embedModel",
  "embedApiKey",
];
const WAIT_OPTIONS = ["timeoutMs", "intervalMs"];

type Advertised = { description: string; inputSchema: JsonSchema };
type Override = (tool: Advertised) => Advertised;

function withoutProperties(schema: JsonSchema, names: string[]): JsonSchema {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).filter(([name]) => !names.includes(name)),
    ),
  };
}

function withProperty(
  schema: JsonSchema,
  name: string,
  property: JsonSchema,
): JsonSchema {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return { ...schema, properties: { ...properties, [name]: property } };
}

/** Rarely used vector/wait options stay accepted but are named, not typed. */
const fieldDefinitionTool: Override = ({ description, inputSchema }) => ({
  description: `${description} Also accepts vector options (${VECTOR_FIELD_OPTIONS.join(", ")}) and ${WAIT_OPTIONS.join("/")}.`,
  inputSchema: withoutProperties(inputSchema, [
    ...VECTOR_FIELD_OPTIONS,
    ...WAIT_OPTIONS,
  ]),
});

/** A large undocumented config object becomes a list of its keys. */
function collapsedObject(name: string): Override {
  return ({ description, inputSchema }) => {
    const properties = isRecord(inputSchema.properties)
      ? inputSchema.properties
      : {};
    const target = properties[name];
    if (!isRecord(target) || !isRecord(target.properties)) {
      return { description, inputSchema };
    }
    const required = Array.isArray(target.required) ? target.required : [];
    const keys = Object.keys(target.properties).map((key) =>
      required.includes(key) ? `${key} (required)` : key,
    );
    return {
      description,
      inputSchema: withProperty(inputSchema, name, {
        type: "object",
        additionalProperties: true,
        description: `Keys: ${keys.join(", ")}.`,
      }),
    };
  };
}

const OVERRIDES: Record<string, Override> = {
  "collections.fields.add": fieldDefinitionTool,
  "collections.fields.replace": fieldDefinitionTool,
  // Alias of `search`: the same input, documented once on `search`.
  "documents.search": ({ description, inputSchema }) => ({
    description,
    inputSchema: withProperty(inputSchema, "params", {
      type: "object",
      additionalProperties: true,
      description: "Same snake_case params as search.",
    }),
  }),
  "nl_search_models.create": collapsedObject("value"),
  "nl_search_models.update": collapsedObject("value"),
};

/** The description and input schema advertised in tools/list. */
export function advertisedTool(
  name: string,
  description: string,
  inputSchema: JsonSchema,
): Advertised {
  const override = OVERRIDES[name];
  const tool = override
    ? override({ description, inputSchema })
    : { description, inputSchema };
  return {
    description: tool.description,
    inputSchema: slimJsonSchema(
      tool.inputSchema,
      name === "search",
    ) as JsonSchema,
  };
}
