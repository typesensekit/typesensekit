import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import type { Operation } from "./types.js";

const documentSchema = z.record(z.unknown());
const MAX_BATCH_SIZE = 100;
const BATCH_CONCURRENCY = 8;
const idsSchema = z.array(z.string().min(1)).min(1).max(MAX_BATCH_SIZE);
const searchParams = z.record(
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
);

export const documentOperations = [
  {
    name: "documents.index",
    summary: "Index a document",
    category: "documents",
    input: z.object({ collection: z.string(), document: documentSchema }),
    execute: async (client, input) =>
      api(client).post(
        `${collectionPath(input.collection)}/documents`,
        input.document,
      ),
  },
  {
    name: "documents.upsert",
    summary: "Upsert a document",
    category: "documents",
    input: z.object({ collection: z.string(), document: documentSchema }),
    execute: async (client, input) =>
      api(client).post(
        `${collectionPath(input.collection)}/documents`,
        input.document,
        { action: "upsert" },
      ),
  },
  {
    name: "documents.get",
    summary: "Get a document by id",
    category: "documents",
    input: z.object({ collection: z.string(), id: z.string() }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/${enc(input.id)}`,
      ),
  },
  {
    name: "documents.get_many",
    summary: "Get multiple documents by id",
    category: "documents",
    input: z.object({ collection: z.string(), ids: idsSchema }),
    execute: async (client, input) => {
      const request = api(client);
      const results: unknown[] = new Array(input.ids.length);
      let next = 0;
      let failed = false;
      let failure: unknown;
      await Promise.all(
        Array.from(
          { length: Math.min(BATCH_CONCURRENCY, input.ids.length) },
          async () => {
            while (!failed && next < input.ids.length) {
              const index = next++;
              try {
                results[index] = await request.get(
                  `${collectionPath(input.collection)}/documents/${enc(input.ids[index])}`,
                );
              } catch (error) {
                if (!failed) failure = error;
                failed = true;
              }
            }
          },
        ),
      );
      if (failed) throw failure;
      return results;
    },
  },
  {
    name: "documents.update",
    summary: "Update a document by id",
    category: "documents",
    input: z.object({
      collection: z.string(),
      id: z.string(),
      document: documentSchema,
    }),
    execute: async (client, input) =>
      api(client).patch(
        `${collectionPath(input.collection)}/documents/${enc(input.id)}`,
        input.document,
      ),
  },
  {
    name: "documents.delete",
    summary: "Delete a document by id",
    category: "documents",
    input: z.object({ collection: z.string(), id: z.string() }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/documents/${enc(input.id)}`,
      ),
  },
  {
    name: "documents.import",
    summary: "Import documents into a collection",
    category: "documents",
    input: z.object({
      collection: z.string(),
      documents: z.union([z.string(), z.array(documentSchema)]),
      action: z.enum(["create", "upsert", "update", "emplace"]).optional(),
    }),
    execute: async (client, input) =>
      api(client).post(
        `${collectionPath(input.collection)}/documents/import`,
        Array.isArray(input.documents)
          ? input.documents
              .map((doc: Record<string, unknown>) => JSON.stringify(doc))
              .join("\n")
          : input.documents,
        input.action ? { action: input.action } : undefined,
        { "Content-Type": "text/plain" },
        { responseType: "text" },
      ),
  },
  {
    name: "documents.export",
    summary: "Export documents from a collection",
    category: "documents",
    input: z.object({
      collection: z.string(),
      params: searchParams.optional(),
    }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/export`,
        input.params,
        { responseType: "text" },
      ),
  },
  {
    name: "documents.search",
    summary: "Search within a collection",
    category: "documents",
    input: z.object({ collection: z.string(), params: searchParams }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/search`,
        input.params,
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
