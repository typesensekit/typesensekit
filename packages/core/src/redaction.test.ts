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
        "X-TYPESENSE-API-KEY": "typesense-key",
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
      "X-TYPESENSE-API-KEY": "[REDACTED]",
      apiKey: "[REDACTED]",
      token: "[REDACTED]",
      secret: "[REDACTED]",
    });
  });

  it("redacts serialized header strings", () => {
    expect(
      redactSecrets(
        "headers: { 'X-TYPESENSE-API-KEY': 'xyz', Authorization: Bearer abc }",
      ),
    ).toBe(
      "headers: { 'X-TYPESENSE-API-KEY': '[REDACTED]', Authorization: [REDACTED] }",
    );
  });

  it("redacts nested error objects and circular request structures", () => {
    const error = new Error("Authorization: Bearer message-token");
    const request: Record<string, unknown> = {
      headers: { "X-TYPESENSE-API-KEY": "request-key" },
    };
    request.self = request;
    Object.assign(error, {
      config: {
        apiKey: "config-key",
        headers: {
          Authorization: "Bearer config-token",
          "X-TYPESENSE-API-KEY": "header-key",
        },
      },
      request,
    });

    const redacted = redactSecrets(error);

    expect(JSON.stringify(redacted)).not.toContain("config-key");
    expect(JSON.stringify(redacted)).not.toContain("header-key");
    expect(JSON.stringify(redacted)).not.toContain("request-key");
    expect(JSON.stringify(redacted)).not.toContain("message-token");
    expect(redacted).toMatchObject({
      message: "Authorization: [REDACTED]",
      config: {
        apiKey: "[REDACTED]",
        headers: {
          Authorization: "[REDACTED]",
          "X-TYPESENSE-API-KEY": "[REDACTED]",
        },
      },
      request: {
        headers: {
          "X-TYPESENSE-API-KEY": "[REDACTED]",
        },
        self: "[Circular]",
      },
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
