import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import type { Operation } from "./types.js";

export const synonymsOperations = [
  {
    name: "synonyms.list",
    summary: "List synonyms",
    category: "synonyms",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) =>
      api(client).get(`${collectionPath(input.collection)}/synonyms`),
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
