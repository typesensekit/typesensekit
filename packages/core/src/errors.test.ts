import { describe, expect, it } from "vitest";
import {
  formatTypesenseErrorMessage,
  getTypesenseErrorHint,
  normalizeTypesenseError,
} from "./errors.js";

describe("normalizeTypesenseError", () => {
  it("redacts secrets from messages and nested details", () => {
    const error = new Error("Authorization: Bearer message-token");
    Object.assign(error, {
      config: {
        apiKey: "config-key",
        headers: { "X-TYPESENSE-API-KEY": "header-key" },
      },
    });

    const normalized = normalizeTypesenseError(error);

    expect(normalized.message).toBe("Authorization: [REDACTED]");
    expect(normalized.details).toMatchObject({
      config: {
        apiKey: "[REDACTED]",
        headers: { "X-TYPESENSE-API-KEY": "[REDACTED]" },
      },
    });
    expect(JSON.stringify(normalized)).not.toContain("config-key");
    expect(JSON.stringify(normalized)).not.toContain("header-key");
    expect(formatTypesenseErrorMessage(error)).toBe(
      "Authorization: [REDACTED]",
    );
  });
});

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
