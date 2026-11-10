import { z } from "zod";
import { api, collectionPath } from "./http.js";
import type { Operation } from "./types.js";

const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_INTERVAL_MS = 1_000;

const baseFieldSchema = z
  .object({
    name: z.string(),
    facet: z.boolean().optional(),
    index: z.boolean().optional(),
    optional: z.boolean().optional(),
    sort: z.boolean().optional(),
    locale: z.string().optional(),
    infix: z.boolean().optional(),
    stem: z.boolean().optional(),
  })
  .passthrough();

const createFieldSchema = baseFieldSchema.extend({
  type: z.string(),
});

const patchFieldSchema = baseFieldSchema.extend({
  type: z.string().optional(),
  drop: z.boolean().optional(),
});

const fieldFlagShape = {
  facet: z.boolean().optional().describe("Enable facet_by; default false."),
  sort: z
    .boolean()
    .optional()
    .describe("Enable sort_by; numeric default true, string default false."),
  index: z
    .boolean()
    .optional()
    .describe("Index for search/filter/sort/facet; default true."),
  optional: z
    .boolean()
    .optional()
    .describe("Allow missing values; default false."),
  infix: z.boolean().optional().describe("Enable infix search."),
  stem: z.boolean().optional().describe("Enable stemming."),
  locale: z.string().optional().describe("Language locale, e.g. `ja`."),
};

const fieldLifecycleInputSchema = z
  .object({
    collection: z.string().describe("Collection name."),
    field: z.string().optional().describe("Field name."),
    type: z
      .string()
      .optional()
      .describe(
        "Field type (string, int32, float, bool, string[], ...); replace defaults to existing type.",
      ),
    ...fieldFlagShape,
    yes: z.boolean().optional(),
    numDim: z.coerce.number().int().positive().optional(),
    vecDist: z.string().optional(),
    hnswM: z.coerce.number().int().positive().optional(),
    hnswEfConstruction: z.coerce.number().int().positive().optional(),
    embedFrom: z.union([z.string(), z.array(z.string())]).optional(),
    embedModel: z.string().optional(),
    embedApiKey: z.string().optional(),
    timeoutMs: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_WAIT_TIMEOUT_MS),
    intervalMs: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_WAIT_INTERVAL_MS),
  })
  .passthrough();

const waitInputSchema = z.object({
  collection: z.string(),
  fieldPresent: z.string().optional(),
  fieldMissing: z.string().optional(),
  fieldEmbedFrom: z.string().optional(),
  timeoutMs: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_WAIT_TIMEOUT_MS),
  intervalMs: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_WAIT_INTERVAL_MS),
});

type FieldLifecycleInput = z.infer<typeof fieldLifecycleInputSchema>;
type WaitInput = z.infer<typeof waitInputSchema>;
type FieldDefinition = Record<string, unknown> & { name?: unknown };
type CollectionSchema = { fields?: unknown[] };

const FIELD_LIFECYCLE_KEYS = new Set([
  "collection",
  "field",
  "yes",
  "numDim",
  "vecDist",
  "hnswM",
  "hnswEfConstruction",
  "embedFrom",
  "embedModel",
  "embedApiKey",
  "timeoutMs",
  "intervalMs",
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestedFieldName(input: FieldLifecycleInput): string {
  const name = input.field ?? input.name;
  if (typeof name !== "string" || !name) {
    throw new Error(
      "A field name is required. Pass field (CLI: --field) or include name.",
    );
  }
  return name;
}

function requiresConfirmation(collection: string): boolean {
  return (
    /^production(?:__|-|$)/i.test(collection) ||
    /^prod(?:__|-|$)/i.test(collection)
  );
}

function assertDestructiveConfirmed(input: FieldLifecycleInput): void {
  if (requiresConfirmation(input.collection) && !input.yes) {
    throw new Error(
      `Refusing to modify production collection ${input.collection} without --yes.`,
    );
  }
}

function findField(collection: CollectionSchema, fieldName: string): unknown {
  return collection.fields?.find((field) => {
    if (!isObject(field)) return false;
    return field.name === fieldName;
  });
}

async function retrieveCollection(
  client: Parameters<Operation<z.ZodTypeAny, unknown>["execute"]>[0],
  collection: string,
): Promise<CollectionSchema> {
  return api(client).get(collectionPath(collection));
}

function buildFieldDefinition(input: FieldLifecycleInput): FieldDefinition {
  const field = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => value !== undefined && !FIELD_LIFECYCLE_KEYS.has(key),
    ),
  ) as FieldDefinition;

  field.name = requestedFieldName(input);

  if (input.numDim !== undefined) field.num_dim = input.numDim;
  if (input.vecDist !== undefined) field.vec_dist = input.vecDist;

  if (input.hnswM !== undefined || input.hnswEfConstruction !== undefined) {
    const hnswParams = isObject(field.hnsw_params) ? field.hnsw_params : {};
    if (input.hnswM !== undefined) hnswParams.M = input.hnswM;
    if (input.hnswEfConstruction !== undefined) {
      hnswParams.ef_construction = input.hnswEfConstruction;
    }
    field.hnsw_params = hnswParams;
  }

  if (
    input.embedFrom !== undefined ||
    input.embedModel !== undefined ||
    input.embedApiKey !== undefined
  ) {
    const embed = isObject(field.embed) ? field.embed : {};
    const modelConfig = isObject(embed.model_config) ? embed.model_config : {};

    if (input.embedFrom !== undefined) {
      embed.from = Array.isArray(input.embedFrom)
        ? input.embedFrom
        : [input.embedFrom];
    }
    if (input.embedModel !== undefined)
      modelConfig.model_name = input.embedModel;
    if (input.embedApiKey !== undefined)
      modelConfig.api_key = input.embedApiKey;
    embed.model_config = modelConfig;
    field.embed = embed;
  }

  if (typeof field.type !== "string" || !field.type) {
    throw new Error(
      "A field type is required. Pass type (CLI: --type), e.g. string, int32, float, bool, string[].",
    );
  }

  return field;
}

function parseEmbedFromCondition(condition: string): {
  fieldName: string;
  source: string;
} {
  const separator = condition.indexOf(":");
  if (separator === -1) {
    throw new Error("--field-embed-from must use FIELD:SOURCE format.");
  }
  return {
    fieldName: condition.slice(0, separator),
    source: condition.slice(separator + 1),
  };
}

function isTransientCollectionUpdateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /another collection update operation is in progress/i.test(message) ||
    /timeout of \d+ms exceeded/i.test(message) ||
    /econnaborted/i.test(message)
  );
}

function evaluateWaitCondition(collection: CollectionSchema, input: WaitInput) {
  const conditions = [
    input.fieldPresent,
    input.fieldMissing,
    input.fieldEmbedFrom,
  ].filter(Boolean);

  if (conditions.length !== 1) {
    throw new Error(
      "Pass exactly one wait condition: fieldPresent, fieldMissing, or fieldEmbedFrom (CLI: --field-present, --field-missing, --field-embed-from). Schema operations in this toolkit already wait for their changes, so a separate wait is rarely needed.",
    );
  }

  if (input.fieldPresent) {
    return {
      ok: Boolean(findField(collection, input.fieldPresent)),
      condition: "field-present",
      field: input.fieldPresent,
    };
  }

  if (input.fieldMissing) {
    return {
      ok: !findField(collection, input.fieldMissing),
      condition: "field-missing",
      field: input.fieldMissing,
    };
  }

  const { fieldName, source } = parseEmbedFromCondition(
    input.fieldEmbedFrom ?? "",
  );
  const field = findField(collection, fieldName);
  const from =
    isObject(field) && isObject(field.embed) && Array.isArray(field.embed.from)
      ? field.embed.from
      : [];

  return {
    ok: from.includes(source),
    condition: "field-embed-from",
    field: fieldName,
    source,
  };
}

async function waitForCollectionCondition(
  client: Parameters<Operation<z.ZodTypeAny, unknown>["execute"]>[0],
  input: WaitInput,
) {
  const startedAt = Date.now();
  let lastError: unknown;
  let attempts = 0;

  while (Date.now() - startedAt <= input.timeoutMs) {
    attempts += 1;
    try {
      const collection = await retrieveCollection(client, input.collection);
      const result = evaluateWaitCondition(collection, input);
      if (result.ok) {
        return {
          collection: input.collection,
          attempts,
          ...result,
        };
      }
    } catch (error) {
      if (!isTransientCollectionUpdateError(error)) throw error;
      lastError = error;
    }

    await sleep(input.intervalMs);
  }

  const detail =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(
    `Timed out waiting for collection ${input.collection} schema condition.${detail}`,
  );
}

async function dropField(
  client: Parameters<Operation<z.ZodTypeAny, unknown>["execute"]>[0],
  input: FieldLifecycleInput,
) {
  assertDestructiveConfirmed(input);
  const fieldName = requestedFieldName(input);
  const collection = await retrieveCollection(client, input.collection);
  const existingField = findField(collection, fieldName);

  if (!existingField) {
    return {
      ok: true,
      collection: input.collection,
      field: fieldName,
      alreadyMissing: true,
    };
  }

  const result = await api(client).patch(collectionPath(input.collection), {
    fields: [{ name: fieldName, drop: true }],
  });

  return {
    ok: true,
    collection: input.collection,
    field: fieldName,
    before: existingField,
    result,
  };
}

async function addField(
  client: Parameters<Operation<z.ZodTypeAny, unknown>["execute"]>[0],
  input: FieldLifecycleInput,
) {
  const field = buildFieldDefinition(input);
  const result = await api(client).patch(collectionPath(input.collection), {
    fields: [field],
  });

  return {
    ok: true,
    collection: input.collection,
    field: field.name,
    added: field,
    result,
  };
}

/** Discovery projection only; full schemas remain available through retrieve/list. */
function projectCollection(value: unknown): unknown {
  if (!isObject(value)) return value;
  const keys = [
    "name",
    "num_documents",
    "default_sorting_field",
    "synonym_sets",
    "curation_sets",
  ];
  const result = Object.fromEntries(
    keys.filter((key) => key in value).map((key) => [key, value[key]]),
  );
  if (Array.isArray(value.fields)) {
    result.fields = value.fields.map((field) =>
      isObject(field)
        ? Object.fromEntries(
            ["name", "type", "facet", "sort", "index", "optional"]
              .filter((key) => key in field)
              .map((key) => [key, field[key]]),
          )
        : field,
    );
  }
  return result;
}

export const collectionOperations = [
  {
    name: "collections.create",
    summary: "Create a collection",
    description:
      "Create a collection from a schema: name, fields [{name, type, facet?, sort?, index?, optional?}], optional default_sorting_field. Field types: string, int32, int64, float, bool, string[], int32[], float[], object, geopoint, auto.",
    category: "collections",
    input: z.object({
      name: z.string(),
      fields: z.array(createFieldSchema),
      default_sorting_field: z.string().optional(),
      token_separators: z.array(z.string()).optional(),
      symbols_to_index: z.array(z.string()).optional(),
      enable_nested_fields: z.boolean().optional(),
    }),
    execute: async (client, input) => api(client).post("/collections", input),
  },
  {
    name: "collections.list",
    summary: "List collections",
    description:
      "Discover collections. Prefer compact:true: returns {collections, aliases} with names, counts, field name/type/facet/sort/index/optional flags, default_sorting_field and linked synonym/curation sets. Default: full schema array. collections.retrieve gives omitted schema details.",
    category: "collections",
    input: z.object({ compact: z.boolean().optional() }),
    execute: async (client, input) => {
      if (!input.compact) return api(client).get("/collections");
      const [collections, aliases] = await Promise.all([
        api(client).get<unknown[]>("/collections"),
        api(client).get<{ aliases: unknown[] }>("/aliases"),
      ]);
      return {
        collections: collections.map((collection) =>
          projectCollection(collection),
        ),
        aliases: aliases.aliases,
      };
    },
  },
  {
    name: "collections.retrieve",
    summary: "Retrieve a collection",
    description:
      "Get full schema and num_documents for a collection/alias; includes details omitted by compact discovery.",
    category: "collections",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) =>
      api(client).get(collectionPath(input.collection)),
  },
  {
    name: "collections.update",
    summary: "Update a collection schema",
    description:
      "Patch a collection schema: add new fields ({name, type, ...}) or drop fields ({name, drop: true}). Typesense cannot change an existing field in place (error: already part of the schema): to change facet/sort/index/optional/type of an existing field, use collections.fields.replace.",
    category: "collections",
    input: z.object({
      collection: z.string(),
      fields: z.array(patchFieldSchema).optional(),
    }),
    execute: async (client, input) =>
      api(client).patch(collectionPath(input.collection), {
        fields: input.fields,
      }),
  },
  {
    name: "collections.wait",
    summary: "Wait for a collection schema condition",
    description:
      "Poll until a schema condition holds: exactly one of fieldPresent, fieldMissing, or fieldEmbedFrom (FIELD:SOURCE). The collections.fields.* tools already wait for their own changes.",
    category: "collections",
    input: waitInputSchema,
    execute: waitForCollectionCondition,
  },
  {
    name: "collections.fields.add",
    summary: "Add a field to a collection",
    description:
      "Add one field to an existing collection: field, type, and flags (facet, sort, index, optional, ...). Existing documents are indexed for the new field from their stored values.",
    category: "collections",
    input: fieldLifecycleInputSchema,
    execute: addField,
  },
  {
    name: "collections.fields.drop",
    summary: "Drop a field from a collection",
    description:
      "Drop one field from a collection schema (documents keep their stored values; the field is just no longer indexed).",
    category: "collections",
    input: fieldLifecycleInputSchema,
    execute: dropField,
  },
  {
    name: "collections.fields.replace",
    summary: "Safely replace a collection field",
    description:
      "Change an existing field's definition (e.g. make it facetable, sortable, indexed or optional): drops the field and re-adds it with exactly the flags you pass (omitted flags revert to defaults; type defaults to the current type), then waits until it is applied. Typesense re-indexes the stored values, so no export/import is needed. Returns before/after definitions.",
    category: "collections",
    input: fieldLifecycleInputSchema,
    execute: async (client, input) => {
      const fieldName = requestedFieldName(input);
      let definition = input;
      if (input.type === undefined) {
        const existing = findField(
          await retrieveCollection(client, input.collection),
          fieldName,
        );
        if (isObject(existing) && typeof existing.type === "string") {
          definition = { ...input, type: existing.type };
        }
      }
      const replacement = buildFieldDefinition(definition);
      const dropResult = await dropField(client, input);

      await waitForCollectionCondition(client, {
        collection: input.collection,
        fieldMissing: fieldName,
        timeoutMs: input.timeoutMs,
        intervalMs: input.intervalMs,
      });

      try {
        await api(client).patch(collectionPath(input.collection), {
          fields: [replacement],
        });
      } catch (error) {
        throw new Error(
          [
            error instanceof Error ? error.message : String(error),
            "",
            "The original field was dropped, but adding the replacement failed.",
            `Recover with: tsk collections.fields.add --collection ${input.collection} --input field.json`,
          ].join("\n"),
        );
      }

      const waitResult = await waitForCollectionCondition(client, {
        collection: input.collection,
        fieldPresent: fieldName,
        timeoutMs: input.timeoutMs,
        intervalMs: input.intervalMs,
      });
      const collection = await retrieveCollection(client, input.collection);

      return {
        ok: true,
        collection: input.collection,
        field: fieldName,
        before: "before" in dropResult ? dropResult.before : undefined,
        after: findField(collection, fieldName),
        wait: waitResult,
      };
    },
  },
  {
    name: "collections.delete",
    summary: "Delete a collection",
    description: "Permanently delete a collection and all its documents.",
    category: "collections",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) =>
      api(client).delete(collectionPath(input.collection)),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
