import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createTypesenseMcpServer } from "./server.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_PATH = "/mcp";
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export type McpHttpConfig = {
  host: string;
  port: number;
  path: string;
  maxBodyBytes: number;
  bearerToken?: string;
  allowedOrigins: Set<string>;
  allowUnauthenticated: boolean;
};

export type RequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  maxBodyBytes: number,
) => Promise<void>;

class BodyTooLargeError extends Error {}
class InvalidJsonError extends Error {}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

function readBoolean(value: string | undefined): boolean {
  return (
    value !== undefined &&
    ["1", "true", "yes", "on"].includes(value.toLowerCase())
  );
}

function isLoopback(host: string): boolean {
  return ["127.0.0.1", "::1", "localhost"].includes(host.toLowerCase());
}

export function readHttpConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpHttpConfig {
  const host = env.TYPESENSEKIT_MCP_HOST ?? DEFAULT_HOST;
  const port = positiveInteger(
    env.TYPESENSEKIT_MCP_PORT ?? env.PORT,
    DEFAULT_PORT,
    "MCP HTTP port",
  );
  const configuredPath = env.TYPESENSEKIT_MCP_PATH ?? DEFAULT_PATH;
  const path = configuredPath.startsWith("/")
    ? configuredPath
    : `/${configuredPath}`;
  const bearerToken = env.TYPESENSEKIT_MCP_BEARER_TOKEN;
  const allowUnauthenticated = readBoolean(
    env.TYPESENSEKIT_MCP_ALLOW_UNAUTHENTICATED,
  );
  const configuredOrigins = (env.TYPESENSEKIT_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    ...configuredOrigins,
  ]);

  if (!isLoopback(host) && !bearerToken && !allowUnauthenticated) {
    throw new Error(
      "Refusing unauthenticated non-loopback MCP HTTP binding. Set TYPESENSEKIT_MCP_BEARER_TOKEN or explicitly trust an authenticating proxy with TYPESENSEKIT_MCP_ALLOW_UNAUTHENTICATED=true.",
    );
  }

  return {
    host,
    port,
    path,
    bearerToken,
    allowedOrigins,
    allowUnauthenticated,
    maxBodyBytes: positiveInteger(
      env.TYPESENSEKIT_MCP_MAX_BODY_BYTES,
      DEFAULT_MAX_BODY_BYTES,
      "MCP HTTP body limit",
    ),
  };
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  res.writeHead(statusCode, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function jsonRpcError(message: string) {
  return {
    jsonrpc: "2.0",
    error: { code: -32603, message },
    id: null,
  };
}

function secureEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function authorized(req: IncomingMessage, bearerToken: string | undefined) {
  if (!bearerToken) return true;
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  return secureEqual(header.slice("Bearer ".length), bearerToken);
}

export async function readJsonBody(req: IncomingMessage, maxBodyBytes: number) {
  const declaredLength = Number(req.headers["content-length"] ?? 0);
  if (declaredLength > maxBodyBytes) throw new BodyTooLargeError();

  return new Promise<unknown>((resolve, reject) => {
    let body = "";
    let bytes = 0;
    let exceeded = false;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBodyBytes) {
        exceeded = true;
        return;
      }
      body += chunk;
    });
    req.on("error", reject);
    req.on("end", () => {
      if (exceeded) {
        reject(new BodyTooLargeError());
        return;
      }
      if (!body) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new InvalidJsonError());
      }
    });
  });
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  maxBodyBytes: number,
) {
  const server = createTypesenseMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  const body = await readJsonBody(req, maxBodyBytes);
  await server.connect(transport);
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await transport.handleRequest(req, res, body);
}

export function createMcpHttpServer(
  config: McpHttpConfig,
  requestHandler: RequestHandler = handleMcpRequest,
) {
  return createServer(async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    if (url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname !== config.path) {
      sendJson(res, 404, jsonRpcError("Not found"));
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, jsonRpcError("Method not allowed"));
      return;
    }

    const origin = req.headers.origin;
    if (origin && !config.allowedOrigins.has(origin)) {
      sendJson(res, 403, jsonRpcError("Origin not allowed"));
      return;
    }
    if (!authorized(req, config.bearerToken)) {
      sendJson(res, 401, jsonRpcError("Unauthorized"), {
        "www-authenticate": "Bearer",
      });
      return;
    }

    try {
      await requestHandler(req, res, config.maxBodyBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendJson(res, 413, jsonRpcError("Request body too large"));
        return;
      }
      if (error instanceof InvalidJsonError) {
        sendJson(res, 400, jsonRpcError("Invalid JSON request body"));
        return;
      }
      console.error("MCP HTTP request failed", error);
      if (!res.headersSent) {
        sendJson(res, 500, jsonRpcError("Internal server error"));
      }
    }
  });
}
