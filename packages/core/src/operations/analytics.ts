import { z } from "zod";
import { api, enc } from "./http.js";
import type { Operation } from "./types.js";

export const analyticsOperations = [
  {
    name: "analytics.rules.list",
    summary: "List analytics rules",
    category: "analytics",
    input: z.object({ ruleTag: z.string().optional() }),
    execute: async (client, input) =>
      api(client).get(
        "/analytics/rules",
        input.ruleTag ? { rule_tag: input.ruleTag } : undefined,
      ),
  },
  {
    name: "analytics.rules.create",
    summary: "Create one or more analytics rules",
    category: "analytics",
    input: z.object({
      value: z.union([
        z.record(z.unknown()),
        z.array(z.record(z.unknown())).min(1),
      ]),
    }),
    execute: async (client, input) =>
      api(client).post("/analytics/rules", input.value),
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
    name: "analytics.rules.retrieve",
    summary: "Retrieve an analytics rule",
    category: "analytics",
    input: z.object({ name: z.string() }),
    execute: async (client, input) =>
      api(client).get(`/analytics/rules/${enc(input.name)}`),
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
  {
    name: "analytics.events.list",
    summary: "Retrieve recent analytics events for a user and rule",
    category: "analytics",
    input: z.object({
      userId: z.string().min(1),
      name: z.string().min(1),
      limit: z.number().int().positive().max(1000),
    }),
    execute: async (client, input) =>
      api(client).get("/analytics/events", {
        user_id: input.userId,
        name: input.name,
        n: input.limit,
      }),
  },
  {
    name: "analytics.flush",
    summary: "Flush in-memory analytics data to persistent storage",
    category: "analytics",
    input: z.object({}),
    execute: async (client) => api(client).post("/analytics/flush"),
  },
  {
    name: "analytics.status",
    summary: "Retrieve analytics subsystem status",
    category: "analytics",
    input: z.object({}),
    execute: async (client) => api(client).get("/analytics/status"),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
