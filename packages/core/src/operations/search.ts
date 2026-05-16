import { z } from "zod";
import { api, collectionPath } from "./http.js";
import type { Operation } from "./types.js";

const searchParams = z.record(z.unknown());

export const searchOperations = [
  {
    name: "search",
    summary: "Search a collection",
    category: "search",
    input: z.object({ collection: z.string(), params: searchParams }),
    execute: async (client, input) =>
      api(client).get(
        `${collectionPath(input.collection)}/documents/search`,
        input.params,
      ),
  },
  {
    name: "multi_search",
    summary: "Run a Typesense multi-search",
    category: "search",
    input: z.object({
      searches: z.array(searchParams),
      commonParams: searchParams.optional(),
    }),
    execute: async (client, input) =>
      api(client).post(
        "/multi_search",
        { searches: input.searches },
        input.commonParams,
      ),
  },
] satisfies Operation<z.ZodTypeAny, unknown>[];
