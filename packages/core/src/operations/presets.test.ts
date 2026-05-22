import { describe, expect, it, vi } from "vitest";
import type { TypesenseClient } from "../client.js";
import { presetsOperations } from "./presets.js";

function getOperation(name: string) {
  const operation = presetsOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`${name} not found`);
  return operation;
}

describe("preset operations", () => {
  it("wraps created preset values in the Typesense request body shape", async () => {
    const createOperation = getOperation("presets.create");
    const put = vi.fn().mockResolvedValue({ ok: true });
    const client = { apiCall: { put } } as unknown as TypesenseClient;

    await createOperation.execute(
      client,
      createOperation.input.parse({
        name: "Semantic",
        value: { query_by: "title_embedding" },
      }),
    );

    expect(put).toHaveBeenCalledWith("/presets/Semantic", {
      value: { query_by: "title_embedding" },
    });
  });
});
