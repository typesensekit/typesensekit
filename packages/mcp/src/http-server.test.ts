import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMcpHttpServer,
  type McpHttpConfig,
  type RequestHandler,
  readHttpConfig,
  readJsonBody,
} from "./http-server.js";

let server: Server | undefined;

afterEach(async () => {
  if (server?.listening) {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve())),
    );
  }
  server = undefined;
});

function config(overrides: Partial<McpHttpConfig> = {}): McpHttpConfig {
  return {
    host: "127.0.0.1",
    port: 3000,
    path: "/mcp",
    maxBodyBytes: 1024,
    bearerToken: "test-token",
    allowedOrigins: new Set(["https://trusted.example"]),
    allowUnauthenticated: false,
    ...overrides,
  };
}

async function start(
  value: McpHttpConfig,
  handler: RequestHandler = vi.fn(async (_request, response) => {
    response.writeHead(202).end();
  }),
) {
  server = createMcpHttpServer(value, handler);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return { baseUrl: `http://127.0.0.1:${address.port}`, handler };
}

describe("MCP HTTP configuration", () => {
  it("binds to loopback with bounded bodies by default", () => {
    expect(readHttpConfig({})).toMatchObject({
      host: "127.0.0.1",
      port: 3000,
      path: "/mcp",
      maxBodyBytes: 1024 * 1024,
    });
  });

  it("refuses an unauthenticated non-loopback binding", () => {
    expect(() => readHttpConfig({ TYPESENSEKIT_MCP_HOST: "0.0.0.0" })).toThrow(
      "Refusing unauthenticated non-loopback MCP HTTP binding",
    );
  });

  it("allows a protected non-loopback binding", () => {
    expect(
      readHttpConfig({
        TYPESENSEKIT_MCP_HOST: "0.0.0.0",
        TYPESENSEKIT_MCP_BEARER_TOKEN: "secret",
      }),
    ).toMatchObject({ host: "0.0.0.0", bearerToken: "secret" });
  });
});

describe("MCP HTTP trust boundary", () => {
  it("keeps the health endpoint unauthenticated", async () => {
    const { baseUrl } = await start(config());
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects an unapproved Origin before dispatch", async () => {
    const { baseUrl, handler } = await start(config());
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        origin: "https://attacker.example",
      },
    });
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("requires the configured bearer token", async () => {
    const { baseUrl, handler } = await start(config());
    const response = await fetch(`${baseUrl}/mcp`, { method: "POST" });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(handler).not.toHaveBeenCalled();
  });

  it("dispatches an authenticated request from an allowed Origin", async () => {
    const { baseUrl, handler } = await start(config());
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        origin: "https://trusted.example",
      },
    });
    expect(response.status).toBe(202);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("rejects oversized bodies without buffering them", async () => {
    const handler = vi.fn(async (request, response, maxBodyBytes) => {
      await readJsonBody(request, maxBodyBytes);
      response.writeHead(202).end();
    });
    const { baseUrl } = await start(config({ maxBodyBytes: 8 }), handler);
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: JSON.stringify({ too: "large" }),
    });
    expect(response.status).toBe(413);
  });

  it("reports malformed JSON as a client error", async () => {
    const handler = vi.fn(async (request, response, maxBodyBytes) => {
      await readJsonBody(request, maxBodyBytes);
      response.writeHead(202).end();
    });
    const { baseUrl } = await start(config(), handler);
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer test-token" },
      body: "{invalid",
    });
    expect(response.status).toBe(400);
  });
});
