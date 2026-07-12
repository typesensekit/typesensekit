import { serverConfigSchema } from "@typesensekit/core";
import { defineCommand } from "citty";
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
          required: true,
          description: "Typesense API key",
        },
        timeout: { type: "string", description: "Connection timeout seconds" },
        config: { type: "string", description: "Config file path" },
      },
      async run({ args }) {
        const cfg = await loadConfig(args.config);
        const profile = serverConfigSchema.parse({
          url: args.url,
          apiKey: args.apiKey,
          connectionTimeoutSeconds: args.timeout
            ? Number(args.timeout)
            : undefined,
        });
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
              apiKey: args.reveal
                ? profile.apiKey
                : redactApiKey(profile.apiKey),
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
  },
});
