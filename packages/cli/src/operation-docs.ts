import { z } from "zod";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonSchema = {
  type?: string;
  enum?: string[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

const EXAMPLES: Record<string, JsonValue[]> = {
  "analytics.events.list": [
    {
      userId: "user-1",
      name: "product_click",
      limit: 100,
    },
  ],
  "analytics.rules.create": [
    {
      value: {
        name: "product_clicks",
        type: "counter",
        params: { source: { collections: ["products"] } },
      },
    },
  ],
  "api.call": [
    {
      method: "get",
      path: "/collections",
    },
    {
      method: "put",
      path: "/presets/Semantic",
      body: { value: { query_by: "title_embedding" } },
    },
  ],
  "collections.create": [
    {
      name: "products",
      fields: [
        { name: "title", type: "string" },
        { name: "price", type: "float", optional: true },
      ],
    },
  ],
  "collections.fields.add": [
    {
      collection: "products",
      field: "title_embedding",
      type: "float[]",
      numDim: 1536,
      embedFrom: "title",
      embedModel: "openai/text-embedding-3-small",
    },
  ],
  "collections.wait": [
    {
      collection: "products",
      fieldPresent: "title_embedding",
      timeoutMs: 60000,
    },
  ],
  "curation_sets.upsert": [
    {
      name: "products-core",
      value: {
        items: [
          {
            id: "featured-chair",
            rule: { query: "chair", match: "exact" },
            includes: [{ id: "sku-1", position: 1 }],
          },
        ],
      },
    },
  ],
  "documents.index": [
    {
      collection: "products",
      document: { id: "sku-1", title: "Lounge chair" },
    },
  ],
  "documents.get_many": [
    {
      collection: "products",
      ids: ["sku-1", "sku-2"],
    },
  ],
  "documents.search": [
    {
      collection: "production__products",
      params: {
        q: "*",
        query_by: "q",
      },
    },
  ],
  "keys.create": [
    {
      description: "Search-only key",
      actions: ["documents:search"],
      collections: ["products"],
    },
  ],
  "nl_search_models.create": [
    {
      value: {
        id: "product-search",
        model_name: "openai/gpt-4.1-mini",
        api_key: "your-provider-api-key",
        temperature: 0,
      },
    },
  ],
  "operations.snapshot": [
    {
      snapshotPath: "/var/backups/typesense",
    },
  ],
  "operations.slow_requests.configure": [
    {
      thresholdMs: 2000,
    },
    {
      thresholdMs: -1,
    },
  ],
  "search.facets": [
    {
      collection: "products",
      facetBy: ["brand", "category"],
      filterBy: "in_stock:=true",
      maxFacetValues: 20,
    },
  ],
  "search.suggestions": [
    {
      collection: "products",
      q: "lou",
      queryBy: "title,brand",
      includeFields: ["title", "brand"],
      limit: 5,
    },
  ],
  "stemming.dictionaries.import": [
    {
      id: "irregular-plurals",
      words: [
        { word: "people", root: "person" },
        { word: "children", root: "child" },
      ],
    },
  ],
  "presets.create": [
    {
      name: "Semantic",
      value: { query_by: "title_embedding" },
    },
  ],
  "synonyms.create": [
    {
      collection: "products",
      name: "sofa-couch",
      value: { synonyms: ["sofa", "couch"] },
    },
  ],
  "synonym_sets.list": [{}],
  "synonym_sets.create": [
    {
      name: "products-core",
      value: {
        items: [{ id: "sofa-couch", synonyms: ["sofa", "couch"] }],
      },
    },
  ],
  "synonym_sets.items.list": [
    {
      name: "products-core",
    },
  ],
};

function unwrapSchema(input: z.ZodTypeAny): {
  schema: z.ZodTypeAny;
  optional: boolean;
} {
  if (input instanceof z.ZodOptional) {
    const inner = unwrapSchema(input.unwrap());
    return { schema: inner.schema, optional: true };
  }
  if (input instanceof z.ZodDefault) {
    const inner = unwrapSchema(input.removeDefault());
    return { schema: inner.schema, optional: true };
  }
  if (input instanceof z.ZodNullable) {
    return unwrapSchema(input.unwrap());
  }
  return { schema: input, optional: false };
}

function describeSchema(input: z.ZodTypeAny): JsonSchema {
  const { schema } = unwrapSchema(input);

  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodEnum)
    return { type: "string", enum: schema.options };
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: describeSchema(schema.element) };
  }
  if (schema instanceof z.ZodRecord) {
    const valueType = (schema as z.ZodRecord<z.ZodTypeAny, z.ZodTypeAny>)
      .valueSchema;
    return {
      type: "object",
      additionalProperties: valueType ? describeSchema(valueType) : true,
    };
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as z.ZodTypeAny[];
    return {
      anyOf: options.map((option) => describeSchema(option)),
    };
  }
  if (schema instanceof z.ZodObject) {
    return inputObjectSchema(schema);
  }

  return { type: "unknown" };
}

export function inputObjectSchema(input: z.ZodTypeAny): JsonSchema {
  const { schema } = unwrapSchema(input);
  if (!(schema instanceof z.ZodObject)) return describeSchema(schema);

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  const shape = schema.shape as z.ZodRawShape;
  for (const [name, child] of Object.entries(shape)) {
    const { optional } = unwrapSchema(child);
    properties[name] = describeSchema(child);
    if (!optional) required.push(name);
  }

  return {
    type: "object",
    properties,
    required,
  };
}

export function renderInputSchema(input: z.ZodTypeAny): string {
  return JSON.stringify(inputObjectSchema(input), null, 2);
}

export function renderOperationExamples(
  operationName: string,
  input: z.ZodTypeAny,
): string {
  const examples = EXAMPLES[operationName] ?? [
    exampleFromSchema(inputObjectSchema(input)),
  ];
  return examples
    .map(
      (example) =>
        `tsk ${operationName} --input '${JSON.stringify(example)}' --json`,
    )
    .join("\n");
}

function exampleFromSchema(schema: JsonSchema, propertyName = ""): JsonValue {
  if (schema.enum?.[0]) return schema.enum[0];
  if (schema.anyOf?.[0])
    return exampleFromSchema(schema.anyOf[0], propertyName);
  if (schema.type === "string") {
    if (propertyName === "path") return "/collections";
    if (/collection/i.test(propertyName)) return "products";
    if (/^(?:id|name)$/i.test(propertyName)) return "example";
    if (/query|^q$/i.test(propertyName)) return "*";
    if (/url/i.test(propertyName)) return "https://typesense.example.com";
    if (/key|secret|token/i.test(propertyName)) return "[REDACTED]";
    return "value";
  }
  if (schema.type === "number") return 1;
  if (schema.type === "boolean") return true;
  if (schema.type === "array") {
    return [exampleFromSchema(schema.items ?? {}, propertyName)];
  }
  if (schema.type === "object") {
    return Object.fromEntries(
      (schema.required ?? []).map((name) => [
        name,
        exampleFromSchema(schema.properties?.[name] ?? {}, name),
      ]),
    );
  }
  return null;
}
