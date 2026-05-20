import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redaction.js";

describe("redactSecrets", () => {
  it("redacts secret-like keys through nested objects and arrays", () => {
    expect(
      redactSecrets({
        ok: true,
        embed: {
          model_config: {
            model_name: "openai/text-embedding-3-small",
            api_key: "sk-real",
          },
        },
        headers: [{ authorization: "Bearer token" }],
        apiKey: "camel",
        token: "tok",
        secret: "sec",
      }),
    ).toEqual({
      ok: true,
      embed: {
        model_config: {
          model_name: "openai/text-embedding-3-small",
          api_key: "[REDACTED]",
        },
      },
      headers: [{ authorization: "[REDACTED]" }],
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      secret: "[REDACTED]",
    });
  });

  it("redacts generated Typesense API key values", () => {
    expect(
      redactSecrets({
        id: 1,
        description: "search-only",
        actions: ["documents:search"],
        collections: ["products"],
        value: "generated-key-only-returned-once",
      }),
    ).toEqual({
      id: 1,
      description: "search-only",
      actions: ["documents:search"],
      collections: ["products"],
      value: "[REDACTED]",
    });
  });

  it("does not redact unrelated value fields globally", () => {
    expect(redactSecrets({ value: "visible", label: "example" })).toEqual({
      value: "visible",
      label: "example",
    });
  });
});
