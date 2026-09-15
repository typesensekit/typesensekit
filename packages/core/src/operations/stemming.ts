import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

const wordMappingSchema = z.object({
  word: z.string().min(1),
  root: z.string().min(1),
});

export const stemmingOperations = [
  {
    name: "stemming.dictionaries.list",
    summary: "List stemming dictionaries",
    category: "stemming",
    input: z.object({}),
    execute: async (client) => api(client).get("/stemming/dictionaries"),
  },
  {
    name: "stemming.dictionaries.retrieve",
    summary: "Retrieve a stemming dictionary",
    category: "stemming",
    input: z.object({ id: z.string().min(1) }),
    execute: async (client, input) =>
      api(client).get(`/stemming/dictionaries/${enc(input.id)}`),
  },
  {
    name: "stemming.dictionaries.import",
    summary: "Import or replace a stemming dictionary from word mappings",
    category: "stemming",
    input: z.object({
      id: z.string().min(1),
      words: z.union([z.string().min(1), z.array(wordMappingSchema).min(1)]),
    }),
    execute: async (client, input) =>
      api(client).post(
        "/stemming/dictionaries/import",
        Array.isArray(input.words)
          ? input.words
              .map((mapping: { word: string; root: string }) =>
                JSON.stringify(mapping),
              )
              .join("\n")
          : input.words,
        { id: input.id },
        { "Content-Type": "text/plain" },
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
