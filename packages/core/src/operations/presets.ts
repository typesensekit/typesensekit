import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

export const presetsOperations = [
  {
    name: "presets.list",
    summary: "List presets",
    category: "presets",
    input: z.object({}),
    execute: async (client) => api(client).get("/presets"),
  },
  {
    name: "presets.create",
    summary: "Create or upsert a preset",
    category: "presets",
    input: z.object({
      name: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(`/presets/${enc(input.name)}`, {
        value: input.value,
      }),
  },
  {
    name: "presets.retrieve",
    summary: "Retrieve a preset",
    category: "presets",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).get(`/presets/${enc(input.name)}`),
  },
  {
    name: "presets.delete",
    summary: "Delete a preset",
    category: "presets",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(`/presets/${enc(input.name)}`),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
