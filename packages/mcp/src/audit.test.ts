import { describe, expect, it, vi } from "vitest";
import { createMcpAuditLogger } from "./audit.js";

describe("MCP audit logger", () => {
  it("is disabled by default", () => {
    const sink = vi.fn();
    createMcpAuditLogger({}, sink).record({
      timestamp: new Date(0).toISOString(),
      operation: "health",
      outcome: "started",
    });
    expect(sink).not.toHaveBeenCalled();
  });

  it("writes metadata-only structured events", () => {
    const sink = vi.fn();
    createMcpAuditLogger({ TYPESENSEKIT_MCP_AUDIT_LOG: "true" }, sink).record({
      timestamp: new Date(0).toISOString(),
      operation: "documents.search",
      outcome: "failed",
      durationMs: 25,
      errorName: "TypesenseError",
    });
    const line = sink.mock.calls[0]?.[0];
    expect(JSON.parse(line)).toEqual({
      type: "typesensekit.mcp.tool",
      timestamp: "1970-01-01T00:00:00.000Z",
      operation: "documents.search",
      outcome: "failed",
      durationMs: 25,
      errorName: "TypesenseError",
    });
    expect(line).not.toContain("arguments");
    expect(line).not.toContain("result");
  });
});
