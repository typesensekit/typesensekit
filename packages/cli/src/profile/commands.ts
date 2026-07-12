import { operations, serverConfigSchema } from "@typesensekit/core";
import { defineCommand } from "citty";
import {
  promptForApiKey,
  readApiKeyFromStdin,
  saveKeychainApiKey,
} from "./credentials.js";
import {
  exportProfiles,
  mergeProfileImport,
  readProfileImport,
} from "./portability.js";
import { resolveClient } from "./resolve.js";
import {
  loadConfig,
  type ProfileConfig,
  redactApiKey,
  saveConfig,
} from "./store.js";

export function removeProfile(cfg: ProfileConfig, name: string): void {
  if (!cfg.profiles[name]) throw new Error(`Profile not found: ${name}`);
  delete cfg.profiles[name];
  if (cfg.currentProfile === name) {
    cfg.currentProfile = Object.keys(cfg.profiles)[0];
  }
}

export function renameProfile(
  cfg: ProfileConfig,
  from: string,
  to: string,
): void {
  const profile = cfg.profiles[from];
  if (!profile) throw new Error(`Profile not found: ${from}`);
  if (from !== to && cfg.profiles[to]) {
    throw new Error(`Profile already exists: ${to}`);
  }
  if (from === to) return;

  cfg.profiles[to] = profile;
  delete cfg.profiles[from];
  if (cfg.currentProfile === from) cfg.currentProfile = to;
}

export const profileCommand = defineCommand({
  meta: { name: "profile", description: "Manage Typesense server profiles" },
  subCommands: {
    add: defineCommand({
      meta: { name: "add", description: "Add or update a profile" },
      args: {
        name: {
          type: "positional",
          required: true,
          description: "Profile name",
        },
        url: { type: "string", required: true, description: "Typesense URL" },
        apiKey: {
          type: "string",
          description: "Typesense API key (prefer prompt or --api-key-stdin)",
        },
        apiKeyStdin: {
          type: "boolean",
          description: "Read the API key from stdin",
        },
        keychain: {
          type: "boolean",
          description: "Store the API key in the macOS Keychain",
        },
        timeout: { type: "string", description: "Connection timeout seconds" },
        config: { type: "string", description: "Config file path" },
      },
      async run({ args }) {
        if (args.apiKey !== undefined && args.apiKeyStdin) {
          throw new Error("Use only one of --api-key or --api-key-stdin");
        }
        const apiKey =
          args.apiKey ??
          (args.apiKeyStdin
            ? await readApiKeyFromStdin()
            : await promptForApiKey());
        const cfg = await loadConfig(args.config);
        const connection = serverConfigSchema.omit({ apiKey: true }).parse({
          url: args.url,
          connectionTimeoutSeconds: args.timeout
            ? Number(args.timeout)
            : undefined,
        });
        const profile = args.keychain
          ? { ...connection, apiKeyKeychain: args.name }
          : { ...connection, apiKey };
        if (args.keychain) await saveKeychainApiKey(args.name, apiKey);
        cfg.profiles[args.name] = profile;
        cfg.currentProfile = cfg.currentProfile ?? args.name;
        await saveConfig(cfg, args.config);
        console.log(`Saved profile ${args.name}`);
      },
    }),
    list: defineCommand({
      meta: { name: "list", description: "List profiles" },
      args: { config: { type: "string", description: "Config file path" } },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        for (const [name, profile] of Object.entries(cfg.profiles)) {
          const marker = name === cfg.currentProfile ? "*" : " ";
          console.log(`${marker} ${name}\t${profile.url}`);
        }
      },
    }),
    use: defineCommand({
      meta: { name: "use", description: "Set current profile" },
      args: {
        name: { type: "positional", required: true },
        config: { type: "string" },
      },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        if (!cfg.profiles[args.name])
          throw new Error(`Profile not found: ${args.name}`);
        cfg.currentProfile = args.name;
        await saveConfig(cfg, args.config);
        console.log(`Using profile ${args.name}`);
      },
    }),
    show: defineCommand({
      meta: { name: "show", description: "Show a profile" },
      args: {
        name: { type: "positional" },
        reveal: { type: "boolean" },
        config: { type: "string" },
      },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        const name = args.name ?? cfg.currentProfile;
        if (!name || !cfg.profiles[name])
          throw new Error(`Profile not found: ${name ?? "<none>"}`);
        const profile = cfg.profiles[name];
        console.log(
          JSON.stringify(
            {
              ...profile,
              apiKey: profile.apiKey
                ? args.reveal
                  ? profile.apiKey
                  : redactApiKey(profile.apiKey)
                : undefined,
              credentialSource: profile.apiKeyKeychain
                ? `macOS Keychain (${profile.apiKeyKeychain})`
                : "config file",
              apiKeyKeychain: undefined,
            },
            null,
            2,
          ),
        );
      },
    }),
    remove: defineCommand({
      meta: { name: "remove", description: "Remove a profile" },
      args: {
        name: { type: "positional", required: true },
        config: { type: "string" },
      },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        removeProfile(cfg, args.name);
        await saveConfig(cfg, args.config);
        console.log(`Removed profile ${args.name}`);
      },
    }),
    rename: defineCommand({
      meta: { name: "rename", description: "Rename a profile" },
      args: {
        from: { type: "positional", required: true },
        to: { type: "positional", required: true },
        config: { type: "string" },
      },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        renameProfile(cfg, args.from, args.to);
        await saveConfig(cfg, args.config);
        console.log(`Renamed ${args.from} to ${args.to}`);
      },
    }),
    test: defineCommand({
      meta: {
        name: "test",
        description: "Test a profile's cluster connection",
      },
      args: {
        name: { type: "positional", description: "Profile name" },
        config: { type: "string", description: "Config file path" },
      },
      async run({ args }) {
        const health = operations.find(
          (operation) => operation.name === "health",
        );
        if (!health) throw new Error("Health operation is unavailable");
        const client = await resolveClient({
          profile: args.name,
          config: args.config,
        });
        const result = await health.execute(client, {});
        console.log(JSON.stringify(result, null, 2));
      },
    }),
    export: defineCommand({
      meta: {
        name: "export",
        description: "Export one or all profiles as JSON",
      },
      args: {
        name: { type: "positional", description: "Profile name; omit for all" },
        reveal: { type: "boolean", description: "Include plaintext API keys" },
        config: { type: "string", description: "Config file path" },
      },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        console.log(
          JSON.stringify(exportProfiles(cfg, args.name, args.reveal), null, 2),
        );
      },
    }),
    import: defineCommand({
      meta: { name: "import", description: "Import profiles from JSON" },
      args: {
        source: {
          type: "positional",
          default: "-",
          description: "JSON file path, or - for stdin",
        },
        overwrite: {
          type: "boolean",
          description: "Replace profiles with matching names",
        },
        config: { type: "string", description: "Config file path" },
      },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        const imported = await readProfileImport(args.source);
        const merged = mergeProfileImport(cfg, imported, args.overwrite);
        await saveConfig(merged, args.config);
        console.log("Imported profiles");
      },
    }),
  },
});
