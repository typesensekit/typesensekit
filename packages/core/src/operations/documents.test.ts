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

it("bounds batch size and concurrency while preserving input order", async () => {
  const operation = getOperation("documents.get_many");
  expect(
    operation.input.safeParse({
      collection: "products",
      ids: Array(101).fill("id"),
    }).success,
  ).toBe(false);
  const releases: Array<() => void> = [];
  let active = 0;
  let peak = 0;
  const get = vi.fn(
    (path: string) =>
      new Promise((resolve) => {
        active++;
        peak = Math.max(peak, active);
        releases.push(() => {
          active--;
          resolve({ id: path.split("/").at(-1) });
        });
      }),
  );
  const client = { apiCall: { get } } as unknown as TypesenseClient;
  const ids = Array.from({ length: 9 }, (_, index) => String(index));
  const result = operation.execute(
    client,
    operation.input.parse({ collection: "products", ids }),
  );
  expect(get).toHaveBeenCalledTimes(8);
  releases[3]?.();
  await Promise.resolve();
  expect(get).toHaveBeenCalledTimes(9);
  releases.forEach((release, index) => {
    if (index !== 3) release();
  });
  await expect(result).resolves.toEqual(ids.map((id) => ({ id })));
  expect(peak).toBe(8);
});

it("drains in-flight batch reads after a failure without starting more", async () => {
  const operation = getOperation("documents.get_many");
  let fail!: (error: Error) => void;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const get = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    )
    .mockImplementation(() => held);
  const pending = operation.execute(
    { apiCall: { get } } as unknown as TypesenseClient,
    operation.input.parse({
      collection: "products",
      ids: Array(20).fill("id"),
    }),
  );
  let settled = false;
  const rejected = expect(pending).rejects.toThrow("request failed");
  void pending.catch(() => {
    settled = true;
  });
  fail(new Error("request failed"));
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(get).toHaveBeenCalledTimes(8);
  release();
  await rejected;
  expect(get).toHaveBeenCalledTimes(8);
});

it("deletes and updates documents by filter in one request", async () => {
  const deleteOperation = getOperation("documents.delete_by_filter");
  const updateOperation = getOperation("documents.update_by_filter");
  const del = vi.fn().mockResolvedValue({ num_deleted: 3 });
  const patch = vi.fn().mockResolvedValue({ num_updated: 2 });
  const client = {
    apiCall: { delete: del, patch },
  } as unknown as TypesenseClient;

  await expect(
    deleteOperation.execute(
      client,
      deleteOperation.input.parse({
        collection: "products",
        filterBy: "in_stock:=false",
      }),
    ),
  ).resolves.toEqual({ num_deleted: 3 });
  expect(del).toHaveBeenCalledWith("/collections/products/documents", {
    filter_by: "in_stock:=false",
  });

  await updateOperation.execute(
    client,
    updateOperation.input.parse({
      collection: "products",
      filterBy: "brand:=Acme",
      document: { featured: true },
    }),
  );
  expect(patch).toHaveBeenCalledWith(
    "/collections/products/documents",
    { featured: true },
    { filter_by: "brand:=Acme" },
  );
  expect(
    deleteOperation.input.safeParse({ collection: "products", filterBy: "" })
      .success,
  ).toBe(false);
});

it("copies documents between collections on the server", async () => {
  const operation = getOperation("documents.copy");
  const get = vi.fn().mockResolvedValue('{"id":"1"}\n{"id":"2"}\n');
  const post = vi
    .fn()
    .mockResolvedValue('{"success":true}\n{"success":false,"error":"bad"}');
  const client = { apiCall: { get, post } } as unknown as TypesenseClient;

  await expect(
    operation.execute(
      client,
      operation.input.parse({
        collection: "books",
        target: "books_v2",
        filterBy: "year:>2000",
      }),
    ),
  ).resolves.toEqual({
    exported: 2,
    imported: 1,
    failed: 1,
    errors: [{ success: false, error: "bad" }],
  });
  expect(get).toHaveBeenCalledWith(
    "/collections/books/documents/export",
    { filter_by: "year:>2000" },
    { responseType: "text" },
  );
  expect(post).toHaveBeenCalledWith(
    "/collections/books_v2/documents/import",
    '{"id":"1"}\n{"id":"2"}',
    { action: "create" },
    { "Content-Type": "text/plain" },
    { responseType: "text" },
  );
});
