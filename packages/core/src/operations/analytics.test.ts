import { describe, expect, it, vi } from "vitest";
import { analyticsOperations } from "./analytics.js";

function operation(name: string) {
  const value = analyticsOperations.find(
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

describe("analytics operations", () => {
  it("lists rules with an optional tag filter", async () => {
    const typesense = client();
    await operation("analytics.rules.list").execute(typesense as never, {
      ruleTag: "recommendations",
    });
    expect(typesense.apiCall.get).toHaveBeenCalledWith("/analytics/rules", {
      rule_tag: "recommendations",
    });
  });

  it("creates a batch of rules", async () => {
    const typesense = client();
    const value = [{ name: "searches" }, { name: "clicks" }];
    await operation("analytics.rules.create").execute(typesense as never, {
      value,
    });
    expect(typesense.apiCall.post).toHaveBeenCalledWith(
      "/analytics/rules",
      value,
    );
  });

  it("upserts, retrieves, and deletes an encoded rule name", async () => {
    const typesense = client();
    const name = "popular searches";
    const value = { type: "popular_queries" };
    await operation("analytics.rules.upsert").execute(typesense as never, {
      name,
      value,
    });
    await operation("analytics.rules.retrieve").execute(typesense as never, {
      name,
    });
    await operation("analytics.rules.delete").execute(typesense as never, {
      name,
    });
    const path = "/analytics/rules/popular%20searches";
    expect(typesense.apiCall.put).toHaveBeenCalledWith(path, value);
    expect(typesense.apiCall.get).toHaveBeenCalledWith(path);
    expect(typesense.apiCall.delete).toHaveBeenCalledWith(path);
  });

  it("creates an analytics event", async () => {
    const typesense = client();
    const input = { type: "click", name: "product_click", data: { id: "1" } };
    await operation("analytics.events.create").execute(
      typesense as never,
      input,
    );
    expect(typesense.apiCall.post).toHaveBeenCalledWith(
      "/analytics/events",
      input,
    );
  });

  it("retrieves recent events with current query names", async () => {
    const typesense = client();
    await operation("analytics.events.list").execute(typesense as never, {
      userId: "user-1",
      name: "product_click",
      limit: 100,
    });
    expect(typesense.apiCall.get).toHaveBeenCalledWith("/analytics/events", {
      user_id: "user-1",
      name: "product_click",
      n: 100,
    });
  });

  it("flushes analytics and retrieves status", async () => {
    const typesense = client();
    await operation("analytics.flush").execute(typesense as never, {});
    await operation("analytics.status").execute(typesense as never, {});
    expect(typesense.apiCall.post).toHaveBeenCalledWith("/analytics/flush");
    expect(typesense.apiCall.get).toHaveBeenCalledWith("/analytics/status");
  });
});
