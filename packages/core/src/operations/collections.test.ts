import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { collectionOperations } from "./collections.js";

function getOperation(name: string) {
  const operation = collectionOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

describe("collection operations", () => {
  it("preserves full Typesense field schema attributes on update", async () => {
    const updateOperation = getOperation("collections.update");

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
    const updateOperation = getOperation("collections.update");
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

  it("adds vector and embedding fields from CLI-shaped input", async () => {
    const addOperation = getOperation("collections.fields.add");
    const patch = vi.fn().mockResolvedValue({ fields: [] });
    const client = { apiCall: { patch } } as unknown as TypesenseClient;

    await addOperation.execute(
      client,
      addOperation.input.parse({
        collection: "products",
        field: "title_embedding",
        type: "float[]",
        optional: true,
        numDim: "1536",
        vecDist: "cosine",
        hnswM: "16",
        hnswEfConstruction: "200",
        embedFrom: "embedding_source_text",
        embedModel: "openai/text-embedding-3-small",
        embedApiKey: "sk-real",
      }),
    );

    expect(patch).toHaveBeenCalledWith("/collections/products", {
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
  });

  it("drops an existing field and returns the previous definition", async () => {
    const dropOperation = getOperation("collections.fields.drop");
    const get = vi.fn().mockResolvedValue({
      fields: [{ name: "title_embedding", type: "float[]" }],
    });
    const patch = vi.fn().mockResolvedValue({ ok: true });
    const client = { apiCall: { get, patch } } as unknown as TypesenseClient;

    const result = await dropOperation.execute(
      client,
      dropOperation.input.parse({
        collection: "products",
        field: "title_embedding",
      }),
    );

    expect(result).toMatchObject({
      before: { name: "title_embedding", type: "float[]" },
    });
    expect(patch).toHaveBeenCalledWith("/collections/products", {
      fields: [{ name: "title_embedding", drop: true }],
    });
  });

  it("requires confirmation before destructive production drops", async () => {
    const dropOperation = getOperation("collections.fields.drop");
    await expect(() =>
      dropOperation.execute(
        { apiCall: {} } as unknown as TypesenseClient,
        dropOperation.input.parse({
          collection: "production__products",
          field: "title_embedding",
        }),
      ),
    ).rejects.toThrow("--yes");
  });

  it("waits until a field exists", async () => {
    const waitOperation = getOperation("collections.wait");
    const get = vi.fn().mockResolvedValue({
      fields: [{ name: "title_embedding", type: "float[]" }],
    });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await expect(
      waitOperation.execute(
        client,
        waitOperation.input.parse({
          collection: "products",
          fieldPresent: "title_embedding",
          timeoutMs: 0,
          intervalMs: 0,
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      condition: "field-present",
      field: "title_embedding",
    });
  });

  it("replaces a field by composing drop, wait, add, and wait", async () => {
    const replaceOperation = getOperation("collections.fields.replace");
    const oldField = { name: "title_embedding", type: "float[]" };
    const newField = {
      name: "title_embedding",
      type: "float[]",
      num_dim: 1536,
    };
    const get = vi
      .fn()
      .mockResolvedValueOnce({ fields: [oldField] })
      .mockResolvedValueOnce({ fields: [] })
      .mockResolvedValueOnce({ fields: [newField] })
      .mockResolvedValueOnce({ fields: [newField] });
    const patch = vi.fn().mockResolvedValue({ ok: true });
    const client = { apiCall: { get, patch } } as unknown as TypesenseClient;

    await expect(
      replaceOperation.execute(
        client,
        replaceOperation.input.parse({
          collection: "products",
          field: "title_embedding",
          type: "float[]",
          numDim: 1536,
          timeoutMs: 100,
          intervalMs: 0,
        }),
      ),
    ).resolves.toMatchObject({
      before: oldField,
      after: newField,
    });

    expect(patch).toHaveBeenNthCalledWith(1, "/collections/products", {
      fields: [{ name: "title_embedding", drop: true }],
    });
    expect(patch).toHaveBeenNthCalledWith(2, "/collections/products", {
      fields: [newField],
    });
  });
});
