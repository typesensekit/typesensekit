import { describe, expect, it, vi } from "vitest";
import { nlSearchModelOperations } from "./nl-search-models.js";

function operation(name: string) {
  const value = nlSearchModelOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!value) throw new Error(`Missing operation: ${name}`);
  return value;
}

function client() {
  return {
    apiCall: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("natural language search model operations", () => {
  it("lists models", async () => {
    const typesense = client();
    await operation("nl_search_models.list").execute(typesense as never, {});
    expect(typesense.apiCall.get).toHaveBeenCalledWith("/nl_search_models");
  });

  it("creates a model", async () => {
    const typesense = client();
    const value = { model_name: "openai/gpt-4.1", api_key: "secret" };
    await operation("nl_search_models.create").execute(typesense as never, {
      value,
    });
    expect(typesense.apiCall.post).toHaveBeenCalledWith(
      "/nl_search_models",
      value,
    );
  });

  it("retrieves an encoded model id", async () => {
    const typesense = client();
    await operation("nl_search_models.retrieve").execute(typesense as never, {
      id: "product model",
    });
    expect(typesense.apiCall.get).toHaveBeenCalledWith(
      "/nl_search_models/product%20model",
    );
  });

  it("updates a model with PUT", async () => {
    const typesense = client();
    const value = { temperature: 0.2 };
    await operation("nl_search_models.update").execute(typesense as never, {
      id: "product model",
      value,
    });
    expect(typesense.apiCall.put).toHaveBeenCalledWith(
      "/nl_search_models/product%20model",
      value,
    );
  });

  it("deletes an encoded model id", async () => {
    const typesense = client();
    await operation("nl_search_models.delete").execute(typesense as never, {
      id: "product model",
    });
    expect(typesense.apiCall.delete).toHaveBeenCalledWith(
      "/nl_search_models/product%20model",
    );
  });
});
