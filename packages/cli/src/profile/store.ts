import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { serverConfigSchema } from "@typesensekit/core";
import envPaths from "env-paths";
import { z } from "zod";

export const profileConfigSchema = z.object({
  currentProfile: z.string().optional(),
  profiles: z.record(serverConfigSchema).default({}),
});

export type ProfileConfig = z.infer<typeof profileConfigSchema>;

export function configPath(): string {
  return `${envPaths("typesensekit", { suffix: "" }).config}/config.json`;
}

export async function loadConfig(path = configPath()): Promise<ProfileConfig> {
  try {
    const raw = await readFile(path, "utf8");
    return profileConfigSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { profiles: {} };
    }
    throw error;
  }
}

export async function saveConfig(
  config: ProfileConfig,
  path = configPath(),
): Promise<void> {
  const parsed = profileConfigSchema.parse(config);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, {
    mode: 0o600,
  });
}

export function redactApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "***";
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
