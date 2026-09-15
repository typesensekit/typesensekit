import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TypesenseClient } from "@typesensekit/core";
import { expect, it, vi } from "vitest";
import {
  type McpExecutionConfig,
  McpExecutionController,
} from "./execution.js";
import { registerTypesenseResources } from "./resources.js";

async function withResources(
  config: Partial<McpExecutionConfig>,
  get: () => Promise<unknown>,
  test: (client: Client) => Promise<void>,
) {
  const execution = new McpExecutionController({
    timeoutMs: 1000,
    maxConcurrency: 1,
    rateLimitPerMinute: 100,
    maxResponseBytes: 1024,
    ...config,
  });
  const server = new McpServer({ name: "test", version: "1" });
  registerTypesenseResources(
    server,
    { apiCall: { get } } as unknown as TypesenseClient,
    [],
    true,
    execution,
  );
  server.registerTool("probe", {}, async () =>
    execution.run(async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    })),
  );
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    await test(client);
  } finally {
    await client.close();
    await server.close();
  }
}

const uri = "typesense://collections/products/documents/1";

it("applies response limits to resource reads", async () => {
  await withResources(
    { maxResponseBytes: 10 },
    async () => ({ text: "too long" }),
    async (client) => {
      await expect(client.readResource({ uri })).rejects.toThrow(
        "exceeding the 10-byte limit",
      );
    },
  );
});

it("shares rate limits across tools and resources", async () => {
  const get = vi.fn(async () => ({}));
  await withResources({ rateLimitPerMinute: 1 }, get, async (client) => {
    expect((await client.callTool({ name: "probe" })).isError).not.toBe(true);
    await expect(client.readResource({ uri })).rejects.toThrow(
      "rate limit exceeded",
    );
    expect(get).not.toHaveBeenCalled();
  });
});

it("retains resource concurrency after a timeout until the request settles", async () => {
  let release!: () => void;
  let start!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const get = () =>
    new Promise<Record<string, unknown>>((resolve) => {
      release = () => resolve({});
      start();
    });
  await withResources({ timeoutMs: 50 }, get, async (client) => {
    const pending = client.readResource({ uri });
    const rejected = expect(pending).rejects.toThrow("timed out");
    await started;
    expect((await client.callTool({ name: "probe" })).isError).toBe(true);
    await rejected;
    await expect(client.readResource({ uri })).rejects.toThrow(
      "concurrency limit exceeded",
    );
    release();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((await client.callTool({ name: "probe" })).isError).not.toBe(true);
  });
});
