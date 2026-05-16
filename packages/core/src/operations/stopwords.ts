import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import type { Operation } from "./types.js";

export const stopwordsOperations = [
  {
    name: "stopwords.list",
    summary: "List stopwords",
    category: "stopwords",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) =>
      api(client).get(`${collectionPath(input.collection)}/stopwords`),
  },
  {
    name: "stopwords.create",
    summary: "Create or upsert a stopword",
    category: "stopwords",
    input: z.object({
      collection: z.string(),
      name: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(
        `${collectionPath(input.collection)}/stopwords/${enc(input.name)}`,
        input.value,
      ),
  },
  {
    name: "stopwords.retrieve",
    summary: "Retrieve a stopword",
    category: "stopwords",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/stopwords/${enc(input.name)}`,
      ),
  },
  {
    name: "stopwords.delete",
    summary: "Delete a stopword",
    category: "stopwords",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/stopwords/${enc(input.name)}`,
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
