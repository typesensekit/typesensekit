import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

function base(name?: string): string {
  return name ? `/synonym_sets/${enc(name)}` : "/synonym_sets";
}

function itemPath(name: string, id?: string): string {
  const path = `${base(name)}/items`;
  return id ? `${path}/${enc(id)}` : path;
}

export const synonymSetOperations = [
  {
    name: "synonym_sets.list",
    summary: "List global synonym sets",
    description:
      "List all global synonym sets (Typesense v30+) with their items ({id, synonyms} for multi-way, or {root, synonyms} for one-way). A collection uses the sets named in its schema's `synonym_sets`.",
    category: "synonyms",
    input: z.object({}),
    execute: async (client) => api(client).get(base()),
  },
  {
    name: "synonym_sets.create",
    summary: "Create or upsert a global synonym set",
    description:
      "Create or replace a whole global synonym set: value {items: [...]} (replaces all items). To add one rule, use synonym_sets.items.create.",
    category: "synonyms",
    input: z.object({
      name: z.string(),
      value: z.object({
        items: z.array(z.record(z.unknown())),
      }),
    }),
    execute: async (client, input) =>
      api(client).put(base(input.name), input.value),
  },
  {
    name: "synonym_sets.retrieve",
    summary: "Retrieve a global synonym set",
    description: "Get one global synonym set with all its items.",
    category: "synonyms",
    input: z.object({ name: z.string() }),
    execute: async (client, input) => api(client).get(base(input.name)),
  },
  {
    name: "synonym_sets.delete",
    summary: "Delete a global synonym set",
    category: "synonyms",
    input: z.object({ name: z.string() }),
    execute: async (client, input) => api(client).delete(base(input.name)),
  },
  {
    name: "synonym_sets.items.list",
    summary: "List items in a global synonym set",
    description: "List the items (synonym rules) in one global synonym set.",
    category: "synonyms",
    input: z.object({ name: z.string() }),
    execute: async (client, input) => api(client).get(itemPath(input.name)),
  },
  {
    name: "synonym_sets.items.create",
    summary: "Create or upsert an item in a global synonym set",
    description:
      "Add or replace one synonym rule in a global synonym set: value {synonyms: [...]} for multi-way, plus root for one-way. Takes effect for every collection linked to the set.",
    category: "synonyms",
    input: z.object({
      name: z.string(),
      id: z.string(),
      value: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).put(itemPath(input.name, input.id), input.value),
  },
  {
    name: "synonym_sets.items.retrieve",
    summary: "Retrieve an item in a global synonym set",
    description: "Get one synonym rule from a global synonym set.",
    category: "synonyms",
    input: z.object({ name: z.string(), id: z.string() }),
    execute: async (client, input) =>
      api(client).get(itemPath(input.name, input.id)),
  },
  {
    name: "synonym_sets.items.delete",
    summary: "Delete an item in a global synonym set",
    category: "synonyms",
    input: z.object({ name: z.string(), id: z.string() }),
    execute: async (client, input) =>
      api(client).delete(itemPath(input.name, input.id)),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
