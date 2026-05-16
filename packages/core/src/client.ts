import Typesense from "typesense";
import { type ServerConfig, serverConfigSchema } from "./config.js";

type NodeConfiguration = {
  host: string;
  port: number;
  protocol: "http" | "https";
  path?: string;
};

type TypesenseClientConfig = ConstructorParameters<typeof Typesense.Client>[0];

export type TypesenseClient = InstanceType<typeof Typesense.Client>;

function nodeFromUrl(url: string): NodeConfiguration {
  const parsed = new URL(url);
  const node: NodeConfiguration = {
    host: parsed.hostname,
    port: parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 80,
    protocol: parsed.protocol.replace(":", "") as "http" | "https",
  };
  if (parsed.pathname !== "/") node.path = parsed.pathname;
  return node;
}

function normalizeNearestNode(
  node: ServerConfig["nearestNode"],
): NodeConfiguration | undefined {
  if (!node) return undefined;
  return {
    host: node.host,
    port: node.port ?? (node.protocol === "http" ? 80 : 443),
    protocol: node.protocol ?? "https",
    path: node.path,
  };
}

export function createClient(config: ServerConfig): TypesenseClient {
  const parsed = serverConfigSchema.parse(config);
  const clientConfig: TypesenseClientConfig = {
    nodes: [nodeFromUrl(parsed.url)],
    apiKey: parsed.apiKey,
    connectionTimeoutSeconds: parsed.connectionTimeoutSeconds,
    nearestNode: normalizeNearestNode(parsed.nearestNode),
    numRetries: parsed.numRetries,
    retryIntervalSeconds: parsed.retryIntervalSeconds,
    healthcheckIntervalSeconds: parsed.healthcheckIntervalSeconds,
  };
  return new Typesense.Client(clientConfig);
}
