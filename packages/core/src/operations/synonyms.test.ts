import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { synonymSetOperations } from "./synonym-sets.js";
import { synonymsOperations } from "./synonyms.js";

function getSynonymOperation(name: string) {
  const operation = synonymsOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

function getSynonymSetOperation(name: string) {
  const operation = synonymSetOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

describe("synonym set operations", () => {
  it("lists global synonym sets", async () => {
    const listOperation = getSynonymSetOperation("synonym_sets.list");
    const get = vi.fn().mockResolvedValue({ synonym_sets: [] });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await listOperation.execute(client, listOperation.input.parse({}));

    expect(get).toHaveBeenCalledWith("/synonym_sets");
  });

  it("creates global synonym sets with items", async () => {
    const createOperation = getSynonymSetOperation("synonym_sets.create");
    const put = vi.fn().mockResolvedValue({ ok: true });
    const client = { apiCall: { put } } as unknown as TypesenseClient;
    const value = {
      items: [{ id: "sofa-couch", synonyms: ["sofa", "couch"] }],
    };

    await createOperation.execute(
      client,
      createOperation.input.parse({ name: "products-core", value }),
    );

    expect(put).toHaveBeenCalledWith("/synonym_sets/products-core", value);
  });

  it("lists items in a global synonym set", async () => {
    const listOperation = getSynonymSetOperation("synonym_sets.items.list");
    const get = vi.fn().mockResolvedValue({ items: [] });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await listOperation.execute(
      client,
      listOperation.input.parse({ name: "products-core" }),
    );

    expect(get).toHaveBeenCalledWith("/synonym_sets/products-core/items");
  });

  it("points collection synonym 404s to linked global synonym sets", async () => {
    const listOperation = getSynonymOperation("synonyms.list");
    const get = vi
      .fn()
      .mockRejectedValueOnce({ httpStatus: 404 })
      .mockResolvedValueOnce({ synonym_sets: ["products-core"] });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await expect(
      listOperation.execute(
        client,
        listOperation.input.parse({ collection: "products" }),
      ),
    ).rejects.toThrow(
      "This collection is linked to global synonym sets: products-core.",
    );
    expect(get).toHaveBeenNthCalledWith(1, "/collections/products/synonyms");
    expect(get).toHaveBeenNthCalledWith(2, "/collections/products");
  });
});
