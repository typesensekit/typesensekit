import { serverConfigSchema } from "@typesensekit/core";

export function readEnvConfig() {
  return serverConfigSchema.parse({
    url: process.env.TYPESENSE_URL,
    apiKey: process.env.TYPESENSE_API_KEY,
    connectionTimeoutSeconds: process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS
      ? Number(process.env.TYPESENSE_CONNECTION_TIMEOUT_SECONDS)
      : undefined,
  });
}
