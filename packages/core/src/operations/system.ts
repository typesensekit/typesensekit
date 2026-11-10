import { z } from "zod";
import { api } from "./http.js";
import type { AnyZod, Operation } from "./types.js";

export const systemOperations = [
  {
    name: "operations.schema_changes",
    summary: "List in-progress collection schema changes",
    description: "List collection schema changes that are still being applied.",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/operations/schema_changes"),
  },
  {
    name: "operations.snapshot",
    summary: "Create a point-in-time server snapshot",
    category: "system",
    input: z.object({ snapshotPath: z.string().min(1) }),
    execute: async (client, input) =>
      api(client).post("/operations/snapshot", undefined, {
        snapshot_path: input.snapshotPath,
      }),
  },
  {
    name: "operations.vote",
    summary: "Trigger leader re-election on a follower node",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).post("/operations/vote"),
  },
  {
    name: "operations.cache.clear",
    summary: "Clear cached search responses",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).post("/operations/cache/clear"),
  },
  {
    name: "operations.db.compact",
    summary: "Compact the on-disk Typesense database",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).post("/operations/db/compact"),
  },
  {
    name: "operations.slow_requests.configure",
    summary: "Configure the slow-request logging threshold",
    category: "system",
    input: z.object({ thresholdMs: z.number().int().min(-1) }),
    execute: async (client, input) =>
      api(client).post("/config", {
        "log-slow-requests-time-ms": input.thresholdMs,
      }),
  },
  {
    name: "health",
    summary: "Check Typesense cluster health",
    description: "Check whether the Typesense cluster is healthy ({ok: true}).",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/health"),
  },
  {
    name: "metrics",
    summary: "Retrieve Typesense metrics",
    description: "Get server resource metrics (CPU, memory, disk).",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/metrics.json"),
  },
  {
    name: "stats",
    summary: "Retrieve Typesense stats",
    description: "Get request rate and latency statistics per endpoint.",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/stats.json"),
  },
  {
    name: "debug",
    summary: "Retrieve Typesense debug info",
    description: "Get Typesense version and node state.",
    category: "system",
    input: z.object({}),
    execute: async (client) => api(client).get("/debug"),
  },
] satisfies Operation<AnyZod, unknown>[];
