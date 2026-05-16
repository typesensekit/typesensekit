import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

export const analyticsOperations = [
  {
    name: "analytics.rules.list",
    summary: "List analytics rules",
    category: "analytics",
    input: z.object({}),
    execute: async (client) => api(client).get("/analytics/rules"),
  },
  {
    name: "analytics.rules.upsert",
    summary: "Create or update an analytics rule",
    category: "analytics",
    input: z.object({ name: z.string(), value: z.record(z.unknown()) }),
    execute: async (client, input) =>
      api(client).put(`/analytics/rules/${enc(input.name)}`, input.value),
  },
  {
    name: "analytics.rules.delete",
    summary: "Delete an analytics rule",
    category: "analytics",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).delete(`/analytics/rules/${enc(input.name)}`),
  },
  {
    name: "analytics.events.create",
    summary: "Create an analytics event",
    category: "analytics",
    input: z.object({
      type: z.string(),
      name: z.string(),
      data: z.record(z.unknown()),
    }),
    execute: async (client, input) =>
      api(client).post("/analytics/events", input),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
