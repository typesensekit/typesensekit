import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import { runCollectionSearch, SEARCH_DESCRIPTION } from "./search.js";
import {
  compactSchema,
  exportParamsSchema,
  FILTER_BY_HELP,
  searchParamsSchema,
} from "./search-params.js";
import type { Operation } from "./types.js";

const documentSchema = z.record(z.unknown());
const MAX_BATCH_SIZE = 100;
const BATCH_CONCURRENCY = 8;
const idsSchema = z.array(z.string().min(1)).min(1).max(MAX_BATCH_SIZE);
const searchParams = searchParamsSchema();
const collection = z.string().describe("Collection name or alias.");
const filterBy = z.string().min(1).describe(FILTER_BY_HELP);

export const documentOperations = [
  {
    name: "documents.index",
    summary: "Index a document",
    description:
      "Create a new document (fails if the id already exists). Use documents.upsert to create-or-replace.",
    category: "documents",
    input: z.object({ collection, document: documentSchema }),
    execute: async (client, input) =>
      api(client).post(
        `${collectionPath(input.collection)}/documents`,
        input.document,
      ),
  },
  {
    name: "documents.upsert",
    summary: "Upsert a document",
    description:
      "Create a document, or fully replace the existing document with the same id.",
    category: "documents",
    input: z.object({ collection, document: documentSchema }),
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
    description:
      "Fetch one document by its id. For several ids, use documents.get_many.",
    category: "documents",
    input: z.object({ collection, id: z.string() }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/${enc(input.id)}`,
      ),
  },
  {
    name: "documents.get_many",
    summary: "Get multiple documents by id",
    description:
      "Fetch up to 100 documents by id in one call; returns them in the same order as `ids`.",
    category: "documents",
    input: z.object({ collection, ids: idsSchema }),
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
    description:
      "Partially update one document by id: only the fields in `document` change. To update every document matching a filter, use documents.update_by_filter.",
    category: "documents",
    input: z.object({
      collection,
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
    description:
      "Delete one document by id; returns the deleted document. To delete every document matching a filter in one call, use documents.delete_by_filter.",
    category: "documents",
    input: z.object({ collection, id: z.string() }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/documents/${enc(input.id)}`,
      ),
  },
  {
    name: "documents.import",
    summary: "Import documents into a collection",
    description:
      "Bulk create/upsert/update/emplace documents (array of objects or JSONL). Returns one JSONL status line per document. Prefer this over many single-document calls; to copy documents between collections, use documents.copy.",
    category: "documents",
    input: z.object({
      collection,
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
    description:
      "Export all documents (or those matching params.filter_by) as a JSONL string. Use include_fields to export only the fields you need. Useful for totals over many documents or backups; for counts, prefer search with per_page: 0.",
    category: "documents",
    input: z.object({
      collection,
      params: exportParamsSchema.optional(),
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
    description: `Same as the \`search\` tool (alias). ${SEARCH_DESCRIPTION}`,
    category: "documents",
    input: z.object({
      collection,
      params: searchParams,
      compact: compactSchema,
    }),
    execute: async (client, input) => runCollectionSearch(client, input),
  },
  {
    name: "documents.copy",
    summary: "Copy documents from one collection to another",
    description:
      "Copy every document (or those matching filterBy) from `collection` into `target` inside the server, without sending documents through the conversation. Typical reindex: collections.create the new schema, documents.copy, then aliases.create to repoint the alias. Returns {exported, imported, failed, errors}.",
    category: "documents",
    input: z.object({
      collection: z.string().describe("Source collection name or alias."),
      target: z.string().describe("Target collection (must already exist)."),
      filterBy: z
        .string()
        .min(1)
        .optional()
        .describe("Only copy documents matching this filter_by expression."),
      action: z
        .enum(["create", "upsert", "update", "emplace"])
        .optional()
        .describe("Import action in the target (default create)."),
    }),
    execute: async (client, input) => {
      const request = api(client);
      const exported = await request.get<string>(
        `${collectionPath(input.collection)}/documents/export`,
        input.filterBy ? { filter_by: input.filterBy } : undefined,
        { responseType: "text" },
      );
      const lines = String(exported ?? "")
        .split("\n")
        .filter((line) => line.trim() !== "");
      if (lines.length === 0) {
        return { exported: 0, imported: 0, failed: 0, errors: [] };
      }
      const response = await request.post<string>(
        `${collectionPath(input.target)}/documents/import`,
        lines.join("\n"),
        { action: input.action ?? "create" },
        { "Content-Type": "text/plain" },
        { responseType: "text" },
      );
      const results = String(response ?? "")
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return { success: false, error: line };
          }
        });
      const failures = results.filter((result) => result.success !== true);
      return {
        exported: lines.length,
        imported: results.length - failures.length,
        failed: failures.length,
        errors: failures.slice(0, 5),
      };
    },
  },
  {
    name: "documents.delete_by_filter",
    summary: "Delete all documents matching a filter",
    description:
      "Delete every document that matches filter_by in one call; returns {num_deleted}. Check the match count first with search (per_page: 0) using the same filter.",
    category: "documents",
    input: z.object({
      collection,
      filterBy,
      batchSize: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Documents deleted per internal batch (Typesense default)."),
    }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/documents`,
        input.batchSize === undefined
          ? { filter_by: input.filterBy }
          : { filter_by: input.filterBy, batch_size: input.batchSize },
      ),
  },
  {
    name: "documents.update_by_filter",
    summary: "Update all documents matching a filter",
    description:
      "Set the given fields on every document that matches filter_by in one call; returns {num_updated}.",
    category: "documents",
    input: z.object({
      collection,
      filterBy,
      document: documentSchema.describe(
        "Fields to set on each matching document.",
      ),
    }),
    execute: async (client, input) =>
      api(client).patch(
        `${collectionPath(input.collection)}/documents`,
        input.document,
        { filter_by: input.filterBy },
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
