import { describe, expect, it } from "vitest";
import { isDestructiveOperation } from "./operation-safety.js";

describe("operation safety", () => {
  it("classifies deletes and dangerous lifecycle operations", () => {
    expect(isDestructiveOperation("documents.delete", {})).toBe(true);
    expect(isDestructiveOperation("collections.fields.replace", {})).toBe(true);
    expect(isDestructiveOperation("documents.search", {})).toBe(false);
  });

  it("classifies raw API calls by method", () => {
    expect(isDestructiveOperation("api.call", { method: "get" })).toBe(false);
    expect(isDestructiveOperation("api.call", { method: "HEAD" })).toBe(false);
    expect(isDestructiveOperation("api.call", { method: "post" })).toBe(true);
    expect(isDestructiveOperation("api.call")).toBe(true);
  });
});
