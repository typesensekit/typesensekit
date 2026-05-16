import { z } from "zod";

export const nodeConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().optional(),
  protocol: z.enum(["http", "https"]).optional(),
  path: z.string().optional(),
});

export const serverConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().min(1),
  connectionTimeoutSeconds: z.number().positive().optional(),
  nearestNode: nodeConfigSchema.optional(),
  numRetries: z.number().int().nonnegative().optional(),
  retryIntervalSeconds: z.number().positive().optional(),
  healthcheckIntervalSeconds: z.number().positive().optional(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
