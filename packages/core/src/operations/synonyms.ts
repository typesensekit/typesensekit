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
    `Collection-level synonyms are unavailable for ${collection} (Typesense v30+ stores synonyms in global synonym sets).`,
    sets.length > 0
      ? `This collection is linked to global synonym sets: ${sets.join(", ")}. Inspect one with synonym_sets.retrieve {"name": "${sets[0]}"}, or all with synonym_sets.list.`
      : "This collection has no linked synonym sets. Use synonym_sets.list to inspect global synonym sets.",
    "CLI: tsk synonym_sets.list --input '{}' --json",
  ].join("\n");
}

export const synonymsOperations = [
  {
    name: "synonyms.list",
    summary: "List synonyms",
    description:
      "Legacy (Typesense v29 and earlier): list collection-level synonyms. On Typesense v30+, synonyms live in global synonym sets linked from the collection schema (`synonym_sets`); use synonym_sets.list or synonym_sets.retrieve.",
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
    description:
      "Legacy (Typesense v29 and earlier): create a collection-level synonym. On v30+ use synonym_sets.items.create.",
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
    description:
      "Legacy (Typesense v29 and earlier): get one collection-level synonym. On v30+ use synonym_sets.items.retrieve.",
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
    description:
      "Legacy (Typesense v29 and earlier): delete a collection-level synonym. On v30+ use synonym_sets.items.delete.",
    category: "synonyms",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/synonyms/${enc(input.name)}`,
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
