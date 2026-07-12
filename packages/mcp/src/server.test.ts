import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { McpExecutionController } from "./execution.js";

vi.stubEnv("TYPESENSE_URL", "http://localhost:8108");
vi.stubEnv("TYPESENSE_API_KEY", "xyz");

describe("MCP server", () => {
  it("creates a server instance", async () => {
    const { createTypesenseMcpServer } = await import("./server.js");
    expect(createTypesenseMcpServer()).toBeTruthy();
  });

  it("publishes safety annotations in protocol tool listings", async () => {
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
      expect(
        tools.find((tool) => tool.name === "documents.search")?.annotations,
      ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(
        tools.find((tool) => tool.name === "collections.delete")?.annotations,
      ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns successful calls as structured and text content", async () => {
    const typesense = createServer((_request, response) => {
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) =>
      typesense.listen(0, "127.0.0.1", resolve),
    );
    const address = typesense.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    vi.stubEnv("TYPESENSE_URL", `http://127.0.0.1:${address.port}`);

    const { createTypesenseMcpServer } = await import("./server.js");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createTypesenseMcpServer({
      executionController: new McpExecutionController({
        timeoutMs: 1_000,
        maxConcurrency: 1,
        rateLimitPerMinute: 10,
        maxResponseBytes: 1024,
      }),
    });
    const client = new Client({ name: "test", version: "1" });

    try {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      const result = await client.callTool({ name: "health", arguments: {} });
      expect(result.structuredContent).toEqual({ result: { ok: true } });
      expect(result.content).toEqual([
        { type: "text", text: '{\n  "ok": true\n}' },
      ]);
    } finally {
      await client.close();
      await server.close();
      await new Promise<void>((resolve, reject) =>
        typesense.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("applies execution response limits to MCP tool calls", async () => {
    const typesense = createServer((_request, response) => {
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ ok: true, detail: "larger than five bytes" }));
    });
    await new Promise<void>((resolve) =>
      typesense.listen(0, "127.0.0.1", resolve),
    );
    const address = typesense.address();
    if (!address || typeof address === "string")
      throw new Error("Missing port");
    vi.stubEnv("TYPESENSE_URL", `http://127.0.0.1:${address.port}`);

    const { createTypesenseMcpServer } = await import("./server.js");
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createTypesenseMcpServer({
      executionController: new McpExecutionController({
        timeoutMs: 1_000,
        maxConcurrency: 1,
        rateLimitPerMinute: 10,
        maxResponseBytes: 5,
      }),
    });
    const client = new Client({ name: "test", version: "1" });

    try {
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
      const result = await client.callTool({ name: "health", arguments: {} });
      expect(result.isError).toBe(true);
      const content = (
        result as { content: Array<{ type: string; text?: string }> }
      ).content[0];
      if (content?.type !== "text") {
        throw new Error("Expected text content");
      }
      expect(content.text).toContain("exceeding the 5-byte limit");
    } finally {
      await client.close();
      await server.close();
      await new Promise<void>((resolve, reject) =>
        typesense.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
