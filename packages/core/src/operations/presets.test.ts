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
  it("lists global presets", async () => {
    const listOperation = getOperation("presets.list");
    const get = vi.fn().mockResolvedValue([]);
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await listOperation.execute(client, listOperation.input.parse({}));

    expect(get).toHaveBeenCalledWith("/presets");
  });

  it("wraps created preset values in the Typesense request body shape", async () => {
    const createOperation = getOperation("presets.create");
    const put = vi.fn().mockResolvedValue({ ok: true });
    const client = { apiCall: { put } } as unknown as TypesenseClient;

    await createOperation.execute(
      client,
      createOperation.input.parse({
        name: "Semantic Search",
        value: { query_by: "title_embedding" },
      }),
    );

    expect(put).toHaveBeenCalledWith("/presets/Semantic%20Search", {
      value: { query_by: "title_embedding" },
    });
  });

  it("retrieves a global preset", async () => {
    const retrieveOperation = getOperation("presets.retrieve");
    const get = vi.fn().mockResolvedValue({});
    const client = { apiCall: { get } } as unknown as TypesenseClient;

    await retrieveOperation.execute(
      client,
      retrieveOperation.input.parse({ name: "Semantic Search" }),
    );

    expect(get).toHaveBeenCalledWith("/presets/Semantic%20Search");
  });

  it("deletes a global preset", async () => {
    const deleteOperation = getOperation("presets.delete");
    const remove = vi.fn().mockResolvedValue({});
    const client = {
      apiCall: { delete: remove },
    } as unknown as TypesenseClient;

    await deleteOperation.execute(
      client,
      deleteOperation.input.parse({ name: "Semantic Search" }),
    );

    expect(remove).toHaveBeenCalledWith("/presets/Semantic%20Search");
  });
});
