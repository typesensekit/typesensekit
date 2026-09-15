import { operations } from "@typesensekit/core";
import Ajv from "ajv";
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
    ).toMatchObject({
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
    expect(
      renderOperationExamples(
        "documents.search",
        operationInput("documents.search"),
      ),
    ).toContain(
      `tsk documents.search --input '{"collection":"production__products","params":{"q":"*","query_by":"q"}}' --json`,
    );
    expect(
      renderOperationExamples(
        "presets.create",
        operationInput("presets.create"),
      ),
    ).toContain(
      `tsk presets.create --input '{"name":"Semantic","value":{"query_by":"title_embedding"}}' --json`,
    );
    expect(
      renderOperationExamples("search.facets", operationInput("search.facets")),
    ).toContain(
      `tsk search.facets --input '{"collection":"products","facetBy":["brand","category"],"filterBy":"in_stock:=true","maxFacetValues":20}' --json`,
    );
    expect(
      renderOperationExamples("api.call", operationInput("api.call")),
    ).toContain(
      `tsk api.call --input '{"method":"get","path":"/collections"}' --json`,
    );
  });

  it("generates an invocation for every registered operation", () => {
    for (const operation of operations) {
      const rendered = renderOperationExamples(operation.name, operation.input);
      expect(rendered).toContain(`tsk ${operation.name} --input '`);
      expect(rendered).not.toContain("No curated examples");
    }
  });
});

it("emits valid JSON Schemas and inputs for every operation", () => {
  const ajv = new Ajv({ strict: false, validateFormats: false });
  for (const operation of operations) {
    const schema = JSON.parse(renderInputSchema(operation.input));
    expect(ajv.validateSchema(schema), operation.name).toBe(true);
    const validate = ajv.compile(schema);
    for (const line of renderOperationExamples(
      operation.name,
      operation.input,
    ).split("\n")) {
      const payload = JSON.parse(
        line.slice(line.indexOf("--input '") + 9, line.lastIndexOf("' --json")),
      );
      expect(operation.input.safeParse(payload).success, operation.name).toBe(
        true,
      );
      expect(
        validate(payload),
        operation.name + JSON.stringify(validate.errors),
      ).toBe(true);
    }
  }
});

it("includes validation limits and passthrough properties", () => {
  const schema = JSON.parse(
    renderInputSchema(operationInput("analytics.events.list")),
  );
  expect(schema.properties.limit).toMatchObject({
    type: "integer",
    maximum: 1000,
  });
  expect(schema.properties.userId).toMatchObject({ minLength: 1 });
  expect(
    JSON.parse(renderInputSchema(operationInput("collections.fields.add")))
      .additionalProperties,
  ).toBe(true);
});
