import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { isDestructiveOperation } from "@typesensekit/core";
import { describe, expect, it, vi } from "vitest";
import {
  formatMcpError,
  mcpErrorHint,
  serverInstructions,
} from "./guidance.js";

vi.stubEnv("TYPESENSE_URL", "http://localhost:8108");
vi.stubEnv("TYPESENSE_API_KEY", "xyz");

const write = { operation: "collections.update", input: {}, readOnly: false };
const read = {
  operation: "search",
  input: { collection: "products" },
  readOnly: true,
};

describe("MCP error hints", () => {
  it("points in-place field changes to collections.fields.replace", () => {
    expect(
      mcpErrorHint(
        "Request failed with HTTP code 400 | Server said: Field `views` is already part of the schema: To change this field, drop it first before adding it back to the schema.",
        write,
      ),
    ).toContain(
      'collections.fields.replace {"collection": ..., "field": "views"',
    );
  });

  it("explains schema flags for facet, filter and sort errors", () => {
    expect(
      mcpErrorHint(
        "Could not find a facet field named `category` in the schema.",
        read,
      ),
    ).toBe(
      '`category` is not a facet field: only fields with facet: true can be used in facet_by. Check collections.retrieve {"collection": "products"}.',
    );
    expect(
      mcpErrorHint(
        "Could not find a filter field named `area` in the schema.",
        { ...read, readOnly: false },
      ),
    ).toContain("collections.fields.replace with index: true");
    expect(
      mcpErrorHint(
        "Could not find a field named `views` in the schema for sorting.",
        read,
      ),
    ).toContain("sort: true");
  });

  it("explains missing query_by, page caps and unknown collections", () => {
    expect(
      mcpErrorHint("No search fields specified for the query.", read),
    ).toContain("query_by");
    expect(
      mcpErrorHint("Only upto 250 hits can be fetched per page.", read),
    ).toContain("page");
    expect(mcpErrorHint("Collection not found", read)).toContain(
      "aliases.list",
    );
  });

  it("leaves unknown errors unchanged", () => {
    expect(formatMcpError("Something else", read)).toBe("Something else");
    expect(formatMcpError("Collection not found", read)).toMatch(
      /^Collection not found\nHint: /,
    );
  });
});

describe("MCP server guidance", () => {
  it("only mentions write workflows in full-access mode", () => {
    expect(serverInstructions(true)).toContain("read-only");
    expect(serverInstructions(true)).not.toContain("delete_by_filter");
    expect(serverInstructions(false)).toContain("collections.fields.replace");
  });

  it("publishes instructions and agent descriptions over the protocol", async () => {
    const { createTypesenseMcpServer } = await import("./server.js");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createTypesenseMcpServer({ readOnly: true });
    const client = new Client({ name: "test", version: "1" });
    try {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      expect(client.getInstructions()).toBe(serverInstructions(true));
      const { tools } = await client.listTools();
      for (const tool of tools) {
        expect(tool.description?.length ?? 0, tool.name).toBeGreaterThanOrEqual(
          20,
        );
      }
      const search = tools.find((tool) => tool.name === "search");
      expect(JSON.stringify(search?.inputSchema)).not.toContain("$ref");
      expect(search?.inputSchema.properties).toHaveProperty("compact");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("marks bulk filter operations as destructive", () => {
    expect(isDestructiveOperation("documents.delete_by_filter")).toBe(true);
    expect(isDestructiveOperation("documents.update_by_filter")).toBe(true);
  });
});
