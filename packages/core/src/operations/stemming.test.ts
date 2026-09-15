import { describe, expect, it, vi } from "vitest";
import { stemmingOperations } from "./stemming.js";

function operation(name: string) {
  const value = stemmingOperations.find((candidate) => candidate.name === name);
  if (!value) throw new Error(`Missing operation: ${name}`);
  return value;
}

function client() {
  return {
    apiCall: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
}

describe("stemming dictionary operations", () => {
  it("lists dictionaries", async () => {
    const typesense = client();
    await operation("stemming.dictionaries.list").execute(
      typesense as never,
      {},
    );
    expect(typesense.apiCall.get).toHaveBeenCalledWith(
      "/stemming/dictionaries",
    );
  });

  it("retrieves an encoded dictionary id", async () => {
    const typesense = client();
    await operation("stemming.dictionaries.retrieve").execute(
      typesense as never,
      { id: "irregular plurals" },
    );
    expect(typesense.apiCall.get).toHaveBeenCalledWith(
      "/stemming/dictionaries/irregular%20plurals",
    );
  });

  it("imports typed mappings as JSONL", async () => {
    const typesense = client();
    await operation("stemming.dictionaries.import").execute(
      typesense as never,
      {
        id: "irregular-plurals",
        words: [
          { word: "people", root: "person" },
          { word: "children", root: "child" },
        ],
      },
    );
    expect(typesense.apiCall.post).toHaveBeenCalledWith(
      "/stemming/dictionaries/import",
      '{"word":"people","root":"person"}\n{"word":"children","root":"child"}',
      { id: "irregular-plurals" },
      { "Content-Type": "text/plain" },
    );
  });

  it("passes existing JSONL through unchanged", async () => {
    const typesense = client();
    const words = '{"word":"people","root":"person"}';
    await operation("stemming.dictionaries.import").execute(
      typesense as never,
      { id: "irregular-plurals", words },
    );
    expect(typesense.apiCall.post).toHaveBeenCalledWith(
      "/stemming/dictionaries/import",
      words,
      { id: "irregular-plurals" },
      { "Content-Type": "text/plain" },
    );
  });
});
