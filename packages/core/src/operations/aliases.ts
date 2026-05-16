import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

export const aliasesOperations = [
  {
    name: "aliases.list",
    summary: "List aliases",
    category: "aliases",
    input: z.object({}),
    execute: async (client) => api(client).get("/aliases"),
  },
  {
    name: "aliases.create",
    summary: "Create or upsert an alias",
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
