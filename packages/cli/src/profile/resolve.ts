import {
  createClient,
  type ServerConfig,
  serverConfigSchema,
  type TypesenseClient,
} from "@typesensekit/core";
import { loadConfig } from "./store.js";

export type ResolveOptions = {
  profile?: string;
  config?: string;
};

export async function resolveServerConfig(
  options: ResolveOptions = {},
): Promise<ServerConfig> {
  const envUrl = process.env.TYPESENSE_URL;
  const envApiKey = process.env.TYPESENSE_API_KEY;
  if (envUrl && envApiKey) {
    return serverConfigSchema.parse({ url: envUrl, apiKey: envApiKey });
  }

  const config = await loadConfig(options.config);
  const profileName = options.profile ?? config.currentProfile;
  if (!profileName) {
    throw new Error(
      "No Typesense profile configured. Run `tsk profile add <name> --url <url> --api-key <key>` or set TYPESENSE_URL and TYPESENSE_API_KEY.",
    );
  }

  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(`Typesense profile not found: ${profileName}`);
  }
  return profile;
}

export async function resolveClient(
  options: ResolveOptions = {},
): Promise<TypesenseClient> {
  return createClient(await resolveServerConfig(options));
}
