import { z } from "zod";
import { api, enc } from "./http.js";
import type { AnyZod, Operation } from "./types.js";

export const keysOperations = [
  {
    name: "keys.list",
    summary: "List API keys",
    description: "List API keys (values are truncated prefixes).",
    category: "keys",
    input: z.object({}),
    execute: async (client) => api(client).get("/keys"),
  },
  {
    name: "keys.create",
    summary: "Create an API key",
    description:
      'Create an API key: value {description, actions (e.g. ["documents:search"]), collections (names or ["*"]), expires_at?}. The full key is returned only once.',
    category: "keys",
    input: z.object({ value: z.record(z.string(), z.unknown()) }),
    execute: async (client, input) => api(client).post("/keys", input.value),
  },
  {
    name: "keys.retrieve",
    summary: "Retrieve an API key",
    category: "keys",
    input: z.object({ id: z.union([z.string(), z.number()]) }),
    execute: async (client, input) =>
      api(client).get(`/keys/${enc(String(input.id))}`),
  },
  {
    name: "keys.delete",
    summary: "Delete an API key",
    category: "keys",
    input: z.object({ id: z.union([z.string(), z.number()]) }),
    execute: async (client, input) =>
      api(client).delete(`/keys/${enc(String(input.id))}`),
  },
] satisfies Operation<AnyZod, unknown>[];
