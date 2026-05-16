import { describe, expect, it, vi } from "vitest";

vi.stubEnv("TYPESENSE_URL", "http://localhost:8108");
vi.stubEnv("TYPESENSE_API_KEY", "xyz");

describe("MCP server", () => {
  it("creates a server instance", async () => {
    const { createTypesenseMcpServer } = await import("./server.js");
    expect(createTypesenseMcpServer()).toBeTruthy();
  });
});
