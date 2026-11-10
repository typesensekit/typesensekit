import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import type { Operation } from "./types.js";

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { httpStatus, status } = error as {
    httpStatus?: unknown;
    status?: unknown;
  };
  return httpStatus === 404 || status === 404;
}

function curationSetNames(collection: { curation_sets?: unknown }): string[] {
  return Array.isArray(collection.curation_sets)
    ? collection.curation_sets.filter(
        (name): name is string => typeof name === "string",
      )
    : [];
}

function globalCurationGuidance(collection: string, sets: string[]): string {
  return [
    `Collection-level overrides are unavailable for ${collection} (Typesense v30+ stores curation rules in global curation sets).`,
    sets.length > 0
      ? `This collection is linked to global curation sets: ${sets.join(", ")}. Inspect one with curation_sets.retrieve {"name": "${sets[0]}"}, or all with curation_sets.list.`
      : "This collection has no linked curation sets. Use curation_sets.list to inspect global curation sets.",
    "CLI: tsk curation_sets.list --input '{}' --json",
  ].join("\n");
}

export const overridesOperations = [
  {
    name: "overrides.list",
    summary: "List overrides",
    description:
      "Legacy (Typesense v29 and earlier): list collection-level overrides. On v30+ curation rules live in global curation sets; use curation_sets.list.",
    category: "overrides",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) => {
      const request = api(client);
      try {
        return await request.get(
          `${collectionPath(input.collection)}/overrides`,
        );
      } catch (error) {
        if (!isNotFound(error)) throw error;
        const collection = await request.get<{ curation_sets?: unknown }>(
          collectionPath(input.collection),
        );
        throw new Error(
          globalCurationGuidance(
            input.collection,
            curationSetNames(collection),
          ),
        );
      }
    },
  },
  {
    name: "overrides.create",
    summary: "Create or upsert a override",
    description:
      "Legacy (Typesense v29 and earlier): create a collection-level override. On v30+ use curation_sets.items.upsert.",
    category: "overrides",
    input: z.object({
      collection: z.string(),
      name: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(
        `${collectionPath(input.collection)}/overrides/${enc(input.name)}`,
        input.value,
      ),
  },
  {
    name: "overrides.retrieve",
    summary: "Retrieve a override",
    description:
      "Legacy (Typesense v29 and earlier): get one collection-level override. On v30+ use curation_sets.items.retrieve.",
    category: "overrides",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/overrides/${enc(input.name)}`,
      ),
  },
  {
    name: "overrides.delete",
    summary: "Delete a override",
    description:
      "Legacy (Typesense v29 and earlier): delete a collection-level override. On v30+ use curation_sets.items.delete.",
    category: "overrides",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/overrides/${enc(input.name)}`,
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
