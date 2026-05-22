import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import type { Operation } from "./types.js";

type CollectionSchema = {
  synonym_sets?: unknown;
};

type ErrorWithStatus = {
  httpStatus?: unknown;
  status?: unknown;
};

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { httpStatus, status } = error as ErrorWithStatus;
  return httpStatus === 404 || status === 404;
}

function synonymSetNames(collection: CollectionSchema): string[] {
  return Array.isArray(collection.synonym_sets)
    ? collection.synonym_sets.filter(
        (name): name is string => typeof name === "string",
      )
    : [];
}

function globalSynonymGuidance(collection: string, sets: string[]): string {
  return [
    `Collection-level synonyms are unavailable for ${collection}.`,
    sets.length > 0
      ? `This collection is linked to global synonym sets: ${sets.join(", ")}.`
      : "This Typesense version may use global synonym sets.",
    "Use synonym_sets.list to inspect global synonym sets:",
    "tsk synonym_sets.list --input '{}' --json",
  ].join("\n");
}

export const synonymsOperations = [
  {
    name: "synonyms.list",
    summary: "List synonyms",
    category: "synonyms",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) => {
      const request = api(client);
      try {
        return await request.get(
          `${collectionPath(input.collection)}/synonyms`,
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;

        const collection = await request.get<CollectionSchema>(
          collectionPath(input.collection),
        );
        throw new Error(
          globalSynonymGuidance(input.collection, synonymSetNames(collection)),
        );
      }
    },
  },
  {
    name: "synonyms.create",
    summary: "Create or upsert a synonym",
    category: "synonyms",
    input: z.object({
      collection: z.string(),
      name: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(
        `${collectionPath(input.collection)}/synonyms/${enc(input.name)}`,
        input.value,
      ),
  },
  {
    name: "synonyms.retrieve",
    summary: "Retrieve a synonym",
    category: "synonyms",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/synonyms/${enc(input.name)}`,
      ),
  },
  {
    name: "synonyms.delete",
    summary: "Delete a synonym",
    category: "synonyms",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/synonyms/${enc(input.name)}`,
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
