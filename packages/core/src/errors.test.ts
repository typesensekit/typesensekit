import { describe, expect, it } from "vitest";
import { getTypesenseErrorHint } from "./errors.js";

describe("getTypesenseErrorHint", () => {
  it("adds drop and wait guidance when a field is already in the schema", () => {
    expect(
      getTypesenseErrorHint(
        new Error(
          "Field `title_embedding` is already part of the schema: To change this field, drop it first before adding it back to the schema.",
        ),
        {
          collection: "products",
          fields: [{ name: "title_embedding" }],
        },
      ),
    ).toContain(
      "tsk collections.fields.drop --collection products --field title_embedding",
    );
  });

  it("adds wait guidance for update lock failures", () => {
    expect(
      getTypesenseErrorHint(
        new Error("Another collection update operation is in progress."),
        {
          collection: "products",
          fields: [{ name: "title_embedding" }],
        },
      ),
    ).toContain(
      "tsk collections.wait --collection products --field-present title_embedding",
    );
  });
});
