import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { apiOperations } from "./api.js";

function getOperation(name: string) {
  const operation = apiOperations.find((candidate) => candidate.name === name);
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

describe("api operations", () => {
  it("accepts uppercase HTTP methods and normalizes them before dispatch", async () => {
    const callOperation = getOperation("api.call");
    const get = vi.fn().mockResolvedValue({ ok: true });
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await callOperation.execute(
      client,
      callOperation.input.parse({
        method: "GET",
        path: "/synonym_sets",
      }),
    );

    expect(get).toHaveBeenCalledWith("/synonym_sets", undefined);
  });
});
