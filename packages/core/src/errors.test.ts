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

  it("formats DNS failures concisely by default", () => {
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND bad.host"), {
      code: "ENOTFOUND",
      hostname: "bad.host",
      config: {
        headers: {
          "X-TYPESENSE-API-KEY": "secret-key",
        },
      },
    });

    expect(formatTypesenseErrorMessage(error)).toBe(
      "Request failed: ENOTFOUND bad.host",
    );
  });

  it("formats refused and timeout failures concisely by default", () => {
    expect(
      formatTypesenseErrorMessage(
        Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8108"), {
          code: "ECONNREFUSED",
          address: "127.0.0.1",
          port: 8108,
        }),
      ),
    ).toBe("Request failed: ECONNREFUSED 127.0.0.1:8108");

    expect(
      formatTypesenseErrorMessage(
        Object.assign(new Error("timeout of 2000ms exceeded"), {
          code: "ECONNABORTED",
        }),
      ),
    ).toBe("Request failed: ECONNABORTED");
  });

  it("includes redacted diagnostic details in debug mode", () => {
    const error = Object.assign(new Error("getaddrinfo ENOTFOUND bad.host"), {
      code: "ENOTFOUND",
      hostname: "bad.host",
      config: {
        headers: {
          Authorization: "Bearer debug-token",
          "X-TYPESENSE-API-KEY": "secret-key",
        },
      },
    });

    const message = formatTypesenseErrorMessage(error, { debug: true });

    expect(message).toContain("Request failed: ENOTFOUND bad.host");
    expect(message).toContain("Debug details:");
    expect(message).toContain('"X-TYPESENSE-API-KEY": "[REDACTED]"');
    expect(message).not.toContain("secret-key");
    expect(message).not.toContain("debug-token");
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
