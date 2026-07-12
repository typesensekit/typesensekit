import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

function base(name?: string): string {
  return name ? `/curation_sets/${enc(name)}` : "/curation_sets";
}

function itemPath(name: string, id?: string): string {
  const path = `${base(name)}/items`;
  return id ? `${path}/${enc(id)}` : path;
}

export const curationSetOperations = [
  {
    name: "curation_sets.list",
    summary: "List global curation sets",
    category: "curations",
    input: z.object({}),
    execute: async (client) => api(client).get(base()),
  },
  {
    name: "curation_sets.upsert",
    summary: "Create or update a global curation set",
    category: "curations",
    input: z.object({
      name: z.string(),
      value: z.object({ items: z.array(z.record(z.unknown())) }),
    }),
    execute: async (client, input) =>
      api(client).put(base(input.name), input.value),
  },
  {
    name: "curation_sets.retrieve",
    summary: "Retrieve a global curation set",
    category: "curations",
    input: z.object({ name: z.string() }),
    execute: async (client, input) => api(client).get(base(input.name)),
  },
  {
    name: "curation_sets.delete",
    summary: "Delete a global curation set",
    category: "curations",
    input: z.object({ name: z.string() }),
    execute: async (client, input) => api(client).delete(base(input.name)),
  },
  {
    name: "curation_sets.items.list",
    summary: "List items in a global curation set",
    category: "curations",
    input: z.object({ name: z.string() }),
    execute: async (client, input) => api(client).get(itemPath(input.name)),
  },
  {
    name: "curation_sets.items.upsert",
    summary: "Create or update an item in a global curation set",
    category: "curations",
    input: z.object({
      name: z.string(),
      id: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(itemPath(input.name, input.id), input.value),
  },
  {
    name: "curation_sets.items.retrieve",
    summary: "Retrieve an item in a global curation set",
    category: "curations",
    input: z.object({ name: z.string(), id: z.string() }),
    execute: async (client, input) =>
      api(client).get(itemPath(input.name, input.id)),
  },
  {
    name: "curation_sets.items.delete",
    summary: "Delete an item in a global curation set",
    category: "curations",
    input: z.object({ name: z.string(), id: z.string() }),
    execute: async (client, input) =>
      api(client).delete(itemPath(input.name, input.id)),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
