import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

export const stopwordsOperations = [
  {
    name: "stopwords.list",
    summary: "List stopwords",
    category: "stopwords",
    input: z.object({}),
    execute: async (client) => api(client).get("/stopwords"),
  },
  {
    name: "stopwords.create",
    summary: "Create or upsert a stopword",
    category: "stopwords",
    input: z.object({
      name: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(`/stopwords/${enc(input.name)}`, input.value),
  },
  {
    name: "stopwords.retrieve",
    summary: "Retrieve a stopword",
    category: "stopwords",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).get(`/stopwords/${enc(input.name)}`),
  },
  {
    name: "stopwords.delete",
    summary: "Delete a stopword",
    category: "stopwords",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(`/stopwords/${enc(input.name)}`),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
