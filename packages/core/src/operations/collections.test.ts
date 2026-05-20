import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { collectionOperations } from "./collections.js";

const updateOperation = collectionOperations.find(
  (operation) => operation.name === "collections.update",
);

describe("collection operations", () => {
  it("preserves full Typesense field schema attributes on update", async () => {
    if (!updateOperation) throw new Error("collections.update not found");

    const input = updateOperation.input.parse({
      collection: "products",
      fields: [
        {
          name: "title_embedding",
          type: "float[]",
          optional: true,
          num_dim: 1536,
          vec_dist: "cosine",
          hnsw_params: { M: 16, ef_construction: 200 },
          embed: {
            from: ["embedding_source_text"],
            model_config: {
              model_name: "openai/text-embedding-3-small",
              api_key: "sk-real",
            },
          },
        },
      ],
    });

    expect((input as { fields: unknown[] }).fields[0]).toMatchObject({
      num_dim: 1536,
      vec_dist: "cosine",
      hnsw_params: { M: 16, ef_construction: 200 },
      embed: {
        from: ["embedding_source_text"],
        model_config: {
          model_name: "openai/text-embedding-3-small",
          api_key: "sk-real",
        },
      },
    });
  });

  it("allows drop field patches without a type", async () => {
    const patch = vi.fn();
    if (!updateOperation) throw new Error("collections.update not found");

    const client = {
      apiCall: {
        patch,
      },
    } as unknown as TypesenseClient;

    const input = updateOperation.input.parse({
      collection: "products",
      fields: [{ name: "title_embedding", drop: true }],
    });

    await updateOperation.execute(client, input);

    expect(patch).toHaveBeenCalledWith("/collections/products", {
      fields: [{ name: "title_embedding", drop: true }],
    });
  });
});
