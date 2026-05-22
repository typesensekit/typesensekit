import { z } from "zod";
import { api, collectionPath, enc } from "./http.js";
import type { Operation } from "./types.js";

function base(collection?: string): string {
  return collection ? `${collectionPath(collection)}/presets` : "/presets";
}

export const presetsOperations = [
  {
    name: "presets.list",
    summary: "List presets",
    category: "presets",
    input: z.object({ collection: z.string().optional() }),
    execute: async (client, input) => api(client).get(base(input.collection)),
  },
  {
    name: "presets.create",
    summary: "Create or upsert a preset",
    category: "presets",
    input: z.object({
      collection: z.string().optional(),
      name: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(`${base(input.collection)}/${enc(input.name)}`, {
        value: input.value,
      }),
  },
  {
    name: "presets.retrieve",
    summary: "Retrieve a preset",
    category: "presets",
    input: z.object({ collection: z.string().optional(), name: z.string() }),
    execute: async (client, input) =>
      api(client).get(`${base(input.collection)}/${enc(input.name)}`),
  },
  {
    name: "presets.delete",
    summary: "Delete a preset",
    category: "presets",
    input: z.object({ collection: z.string().optional(), name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(`${base(input.collection)}/${enc(input.name)}`),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
