import { operations } from "@typesensekit/core";
import { describe, expect, it } from "vitest";
import {
  renderInputSchema,
  renderOperationExamples,
} from "./operation-docs.js";

function operationInput(name: string) {
  const operation = operations.find((candidate) => candidate.name === name);
  if (!operation) throw new Error(`${name} not found`);
  return operation.input;
}

describe("operation docs", () => {
  it("renders the top-level input shape for documents.search", () => {
    expect(
      JSON.parse(renderInputSchema(operationInput("documents.search"))),
    ).toEqual({
      type: "object",
      properties: {
        collection: { type: "string" },
        params: {
          type: "object",
          additionalProperties: {
            anyOf: [
              { type: "string" },
              { type: "number" },
              { type: "boolean" },
              { type: "array", items: { type: "string" } },
              { type: "array", items: { type: "number" } },
            ],
          },
        },
      },
      required: ["collection", "params"],
    });
  });

  it("renders command-specific examples for common operations", () => {
    expect(renderOperationExamples("documents.search")).toContain(
      `tsk documents.search --input '{"collection":"production__products","params":{"q":"*","query_by":"q"}}' --json`,
    );
    expect(renderOperationExamples("presets.create")).toContain(
      `tsk presets.create --input '{"name":"Semantic","value":{"query_by":"title_embedding"}}' --json`,
    );
    expect(renderOperationExamples("search.facets")).toContain(
      `tsk search.facets --input '{"collection":"products","facetBy":["brand","category"],"filterBy":"in_stock:=true","maxFacetValues":20}' --json`,
    );
    expect(renderOperationExamples("api.call")).toContain(
      `tsk api.call --input '{"method":"get","path":"/collections"}' --json`,
    );
  });
});
