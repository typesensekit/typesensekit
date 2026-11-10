import { z } from "zod";
import { api, enc } from "./http.js";
import type { AnyZod, Operation } from "./types.js";

export const presetsOperations = [
  {
    name: "presets.list",
    summary: "List presets",
    description:
      "List all presets (saved search parameter sets) with their values.",
    category: "presets",
    input: z.object({}),
    execute: async (client) => api(client).get("/presets"),
  },
  {
    name: "presets.create",
    summary: "Create or upsert a preset",
    description:
      "Create or replace a preset: value is an object of search parameters (e.g. {query_by, filter_by, sort_by}). Replaces the whole value, so include every parameter you want to keep.",
    category: "presets",
    input: z.object({
      name: z.string(),
      value: z.record(z.string(), z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(`/presets/${enc(input.name)}`, {
        value: input.value,
      }),
  },
  {
    name: "presets.retrieve",
    summary: "Retrieve a preset",
    description: "Get one preset's stored search parameters (value).",
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
] satisfies Operation<AnyZod, unknown>[];
