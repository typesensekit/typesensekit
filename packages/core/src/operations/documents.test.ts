import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { documentOperations } from "./documents.js";

function getOperation(name: string) {
  const operation = documentOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

describe("document helper operations", () => {
  it("retrieves multiple documents by id", async () => {
    const operation = getOperation("documents.get_many");
    const get = vi
      .fn()
      .mockResolvedValueOnce({ id: "sku-1" })
      .mockResolvedValueOnce({ id: "sku-2" });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await expect(
      operation.execute(
        client,
        operation.input.parse({
          collection: "products",
          ids: ["sku-1", "sku-2"],
        }),
      ),
    ).resolves.toEqual([{ id: "sku-1" }, { id: "sku-2" }]);

    expect(get).toHaveBeenNthCalledWith(
      1,
      "/collections/products/documents/sku-1",
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      "/collections/products/documents/sku-2",
    );
  });
});
