import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import type { Operation } from "./types.js";

export const overridesOperations = [
  {
    name: "overrides.list",
    summary: "List overrides",
    category: "overrides",
    input: z.object({ collection: z.string() }),
    execute: async (client, input) =>
      api(client).get(`${collectionPath(input.collection)}/overrides`),
  },
  {
    name: "overrides.create",
    summary: "Create or upsert a override",
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
    category: "overrides",
    input: z.object({ collection: z.string(), name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(
        `${collectionPath(input.collection)}/overrides/${enc(input.name)}`,
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
