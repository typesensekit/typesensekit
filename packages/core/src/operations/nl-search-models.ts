import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

const modelConfigSchema = z
  .object({
    id: z.string().optional(),
    model_name: z.string().optional(),
    api_key: z.string().optional(),
    api_url: z.string().url().optional(),
    max_bytes: z.number().int().positive().optional(),
    temperature: z.number().optional(),
    system_prompt: z.string().optional(),
    top_p: z.number().optional(),
    top_k: z.number().int().optional(),
    stop_sequences: z.array(z.string()).optional(),
    api_version: z.string().optional(),
    project_id: z.string().optional(),
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    region: z.string().optional(),
    max_output_tokens: z.number().int().positive().optional(),
    account_id: z.string().optional(),
  })
  .passthrough();

function modelPath(id: string): string {
  return `/nl_search_models/${enc(id)}`;
}

export const nlSearchModelOperations = [
  {
    name: "nl_search_models.list",
    summary: "List natural language search models",
    category: "nl_search_models",
    input: z.object({}),
    execute: async (client) => api(client).get("/nl_search_models"),
  },
  {
    name: "nl_search_models.create",
    summary: "Create a natural language search model",
    category: "nl_search_models",
    input: z.object({ value: modelConfigSchema }),
    execute: async (client, input) =>
      api(client).post("/nl_search_models", input.value),
  },
  {
    name: "nl_search_models.retrieve",
    summary: "Retrieve a natural language search model",
    category: "nl_search_models",
    input: z.object({ id: z.string().min(1) }),
    execute: async (client, input) => api(client).get(modelPath(input.id)),
  },
  {
    name: "nl_search_models.update",
    summary: "Update a natural language search model",
    category: "nl_search_models",
    input: z.object({ id: z.string().min(1), value: modelConfigSchema }),
    execute: async (client, input) =>
      api(client).put(modelPath(input.id), input.value),
  },
  {
    name: "nl_search_models.delete",
    summary: "Delete a natural language search model",
    category: "nl_search_models",
    input: z.object({ id: z.string().min(1) }),
    execute: async (client, input) => api(client).delete(modelPath(input.id)),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
