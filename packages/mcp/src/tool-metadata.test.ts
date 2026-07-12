import { describe, expect, it } from "vitest";
import { operationToolAnnotations } from "./tool-metadata.js";

function operation(name: string) {
  return { name, summary: name, category: "test" } as never;
}

describe("MCP tool annotations", () => {
  it("marks safe reads as read-only and idempotent", () => {
    expect(operationToolAnnotations(operation("documents.search"))).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("marks deletes and raw API calls as destructive", () => {
    expect(
      operationToolAnnotations(operation("collections.delete")),
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(operationToolAnnotations(operation("api.call"))).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
  });

  it("marks upserts as mutating but idempotent", () => {
    expect(
      operationToolAnnotations(operation("curation_sets.upsert")),
    ).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });
});
