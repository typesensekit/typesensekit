import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

export const keysOperations = [
  {
    name: "keys.list",
    summary: "List API keys",
    category: "keys",
    input: z.object({}),
    execute: async (client) => api(client).get("/keys"),
  },
  {
    name: "keys.create",
    summary: "Create an API key",
    category: "keys",
    input: z.object({ value: z.record(z.unknown()) }),
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
] satisfies Operation<z.ZodTypeAny, unknown>[];
