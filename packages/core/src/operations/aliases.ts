import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

export const aliasesOperations = [
  {
    name: "aliases.list",
    summary: "List aliases",
    description:
      "List all aliases ({name, collection_name}). Every tool's collection argument also accepts an alias name.",
    category: "aliases",
    input: z.object({}),
    execute: async (client) => api(client).get("/aliases"),
  },
  {
    name: "aliases.create",
    summary: "Create or upsert an alias",
    description:
      "Create an alias or repoint an existing one: value {collection_name}. Use for zero-downtime reindexing (build a new collection, then repoint the alias).",
    category: "aliases",
    input: z.object({
      name: z.string(),
      value: z.object({ collection_name: z.string() }),
    }),
    execute: async (client, input) =>
      api(client).put(`/aliases/${enc(input.name)}`, input.value),
  },
  {
    name: "aliases.retrieve",
    summary: "Retrieve an alias",
    description: "Get the collection an alias points to.",
    category: "aliases",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).get(`/aliases/${enc(input.name)}`),
  },
  {
    name: "aliases.delete",
    summary: "Delete an alias",
    category: "aliases",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(`/aliases/${enc(input.name)}`),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
