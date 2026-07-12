import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { curationSetOperations } from "./curation-sets.js";

function operation(name: string) {
  const value = curationSetOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!value) throw new Error(`Missing operation: ${name}`);
  return value;
}

function client() {
  return {
    apiCall: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as TypesenseClient;
}

describe("curation set operations", () => {
  it("lists global curation sets", async () => {
    const typesense = client();
    await operation("curation_sets.list").execute(typesense, {});
    expect(typesense.apiCall.get).toHaveBeenCalledWith("/curation_sets");
  });

  it("upserts an encoded curation set", async () => {
    const typesense = client();
    const value = { items: [{ id: "featured" }] };
    await operation("curation_sets.upsert").execute(typesense, {
      name: "product curations",
      value,
    });
    expect(typesense.apiCall.put).toHaveBeenCalledWith(
      "/curation_sets/product%20curations",
      value,
    );
  });

  it("retrieves and deletes an encoded curation set", async () => {
    const typesense = client();
    const input = { name: "product curations" };
    await operation("curation_sets.retrieve").execute(typesense, input);
    await operation("curation_sets.delete").execute(typesense, input);
    expect(typesense.apiCall.get).toHaveBeenCalledWith(
      "/curation_sets/product%20curations",
    );
    expect(typesense.apiCall.delete).toHaveBeenCalledWith(
      "/curation_sets/product%20curations",
    );
  });

  it("lists, upserts, retrieves, and deletes curation set items", async () => {
    const typesense = client();
    const parent = { name: "product curations" };
    const item = { ...parent, id: "featured item" };
    const value = { rule: { query: "chair", match: "exact" } };

    await operation("curation_sets.items.list").execute(typesense, parent);
    await operation("curation_sets.items.upsert").execute(typesense, {
      ...item,
      value,
    });
    await operation("curation_sets.items.retrieve").execute(typesense, item);
    await operation("curation_sets.items.delete").execute(typesense, item);

    const itemBase = "/curation_sets/product%20curations/items/featured%20item";
    expect(typesense.apiCall.get).toHaveBeenNthCalledWith(
      1,
      "/curation_sets/product%20curations/items",
    );
    expect(typesense.apiCall.put).toHaveBeenCalledWith(itemBase, value);
    expect(typesense.apiCall.get).toHaveBeenNthCalledWith(2, itemBase);
    expect(typesense.apiCall.delete).toHaveBeenCalledWith(itemBase);
  });
});
