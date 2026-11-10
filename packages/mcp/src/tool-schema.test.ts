import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FILTER_BY_HELP } from "@typesensekit/core";
import { describe, expect, it, vi } from "vitest";
import { advertisedTool, slimJsonSchema } from "./tool-schema.js";

vi.stubEnv("TYPESENSE_URL", "http://localhost:8108");
vi.stubEnv("TYPESENSE_API_KEY", "xyz");

describe("slimJsonSchema", () => {
  it("drops schema noise and redundant property descriptions", () => {
    expect(
      slimJsonSchema({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          collection: { type: "string", description: "Collection name." },
          filterBy: { type: "string", description: FILTER_BY_HELP },
          params: {
            type: "object",
            properties: { q: { description: "Query text." } },
            additionalProperties: { anyOf: [{ type: "string" }] },
          },
        },
        required: ["collection"],
        additionalProperties: false,
      }),
    ).toEqual({
      type: "object",
      properties: {
        collection: { type: "string" },
        filterBy: { type: "string" },
        params: {
          type: "object",
          properties: { q: { description: "Query text." } },
          additionalProperties: true,
        },
      },
      required: ["collection"],
    });
  });

  it("keeps a property named like a schema keyword", () => {
    expect(
      slimJsonSchema({
        type: "object",
        properties: { $schema: { type: "string" } },
      }),
    ).toEqual({ type: "object", properties: { $schema: { type: "string" } } });
  });
});

describe("advertisedTool", () => {
  it("names rarely used field options instead of typing them", () => {
    const tool = advertisedTool("collections.fields.replace", "Replace.", {
      type: "object",
      properties: {
        collection: { type: "string" },
        facet: { type: "boolean" },
        numDim: { type: "integer" },
        timeoutMs: { type: "integer" },
      },
    });
    expect(tool.description).toContain("numDim");
    expect(Object.keys(tool.inputSchema.properties as object)).toEqual([
      "collection",
      "facet",
    ]);
  });

  it("collapses large undocumented config objects to their keys", () => {
    const tool = advertisedTool("nl_search_models.create", "Create.", {
      type: "object",
      properties: {
        value: {
          type: "object",
          properties: { model_name: { type: "string" }, api_key: {} },
          required: ["model_name"],
        },
      },
    });
    expect(tool.inputSchema.properties).toEqual({
      value: {
        type: "object",
        additionalProperties: true,
        description: "Keys: model_name (required), api_key.",
      },
    });
  });
});

describe("tools/list", () => {
  it("advertises compact schemas but validates calls with full ones", async () => {
    const { createTypesenseMcpServer } = await import("./server.js");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createTypesenseMcpServer({ readOnly: false });
    const client = new Client({ name: "test", version: "1" });
    try {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(98);
      for (const tool of tools) {
        expect(tool.inputSchema).not.toHaveProperty("$schema");
        expect(tool.inputSchema.type).toBe("object");
      }
      const search = tools.find((tool) => tool.name === "search");
      expect(JSON.stringify(search?.inputSchema)).toContain("Backtick-quote");
      const drop = tools.find(
        (tool) => tool.name === "collections.fields.drop",
      );
      expect(Object.keys(drop?.inputSchema.properties ?? {})).toEqual([
        "collection",
        "field",
        "yes",
      ]);
      const alias = tools.find((tool) => tool.name === "documents.search");
      expect(alias?.annotations).toMatchObject({ readOnlyHint: true });

      // Hidden options are still accepted and validated by the full schema.
      const result = await client.callTool({
        name: "collections.fields.replace",
        arguments: { collection: "c", field: "f", timeoutMs: "not a number" },
      });
      expect(result.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
