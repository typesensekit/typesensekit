import { z } from "zod";
import { api, collectionPath } from "./http.js";
import type { Operation } from "./types.js";

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

export const collectionOperations = [
  {
    name: "collections.create",
    summary: "Create a collection",
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
    category: "collections",
    input: z.object({}),
    execute: async (client) => api(client).get("/collections"),
  },
  {
    name: "collections.retrieve",
    summary: "Retrieve a collection",
    category: "collections",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) =>
      api(client).get(collectionPath(input.collection)),
  },
  {
    name: "collections.update",
    summary: "Update a collection schema",
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
    name: "collections.delete",
    summary: "Delete a collection",
    category: "collections",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) =>
      api(client).delete(collectionPath(input.collection)),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
