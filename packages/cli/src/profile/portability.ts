import { readFile } from "node:fs/promises";
import {
  type ProfileConfig,
  profileConfigSchema,
  storedProfileSchema,
} from "./store.js";

export type ProfileImport =
  | { name: string; profile: ProfileConfig["profiles"][string] }
  | ProfileConfig;

export function exportProfiles(
  config: ProfileConfig,
  name?: string,
  reveal = false,
): unknown {
  const sanitize = (profile: ProfileConfig["profiles"][string]) => ({
    ...profile,
    apiKey: reveal ? profile.apiKey : undefined,
  });

  if (name) {
    const profile = config.profiles[name];
    if (!profile) throw new Error(`Profile not found: ${name}`);
    return { name, profile: sanitize(profile) };
  }

  return {
    currentProfile: config.currentProfile,
    profiles: Object.fromEntries(
      Object.entries(config.profiles).map(([profileName, profile]) => [
        profileName,
        sanitize(profile),
      ]),
    ),
  };
}

export async function readProfileImport(
  source: string,
): Promise<ProfileImport> {
  let raw = "";
  if (source === "-") {
    for await (const chunk of process.stdin) raw += String(chunk);
  } else {
    raw = await readFile(source, "utf8");
  }

  const value = JSON.parse(raw) as unknown;
  if (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "profile" in value
  ) {
    const record = value as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name) {
      throw new Error("Imported profile name must be a non-empty string");
    }
    return {
      name: record.name,
      profile: storedProfileSchema.parse(record.profile),
    };
  }
  return profileConfigSchema.parse(value);
}

export function mergeProfileImport(
  config: ProfileConfig,
  imported: ProfileImport,
  overwrite = false,
): ProfileConfig {
  const additions =
    "name" in imported
      ? { [imported.name]: imported.profile }
      : imported.profiles;
  const conflicts = Object.keys(additions).filter(
    (name) => config.profiles[name],
  );
  if (conflicts.length > 0 && !overwrite) {
    throw new Error(
      `Profiles already exist: ${conflicts.join(", ")}. Use --overwrite to replace them.`,
    );
  }

  return profileConfigSchema.parse({
    currentProfile:
      config.currentProfile ??
      ("name" in imported ? imported.name : imported.currentProfile),
    profiles: { ...config.profiles, ...additions },
  });
}
