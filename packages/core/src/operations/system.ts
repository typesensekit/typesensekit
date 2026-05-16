import { z } from "zod";
import { api } from "./http.js";
import type { Operation } from "./types.js";

export const systemOperations = [
  {
    name: "health",
    summary: "Check Typesense cluster health",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/health"),
  },
  {
    name: "metrics",
    summary: "Retrieve Typesense metrics",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/metrics.json"),
  },
  {
    name: "stats",
    summary: "Retrieve Typesense stats",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/stats.json"),
  },
  {
    name: "debug",
    summary: "Retrieve Typesense debug info",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/debug"),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
