import { z } from "zod";
import { api } from "./http.js";
import type { Operation } from "./types.js";

const methodSchema = z.enum(["get", "post", "put", "patch", "delete"]);

export const apiOperations = [
  {
    name: "api.call",
    summary:
      "Call any Typesense API endpoint not yet covered by a first-class operation",
    category: "api",
    input: z.object({
      method: methodSchema,
      path: z.string().startsWith("/"),
      params: z.record(z.unknown()).optional(),
      body: z.unknown().optional(),
    }),
    execute: async (client, input) => {
      const request = api(client);
      if (input.method === "get") return request.get(input.path, input.params);
      if (input.method === "delete")
        return request.delete(input.path, input.params);
      if (input.method === "post")
        return request.post(input.path, input.body, input.params);
      if (input.method === "put")
        return request.put(input.path, input.body, input.params);
      return request.patch(input.path, input.body, input.params);
    },
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
