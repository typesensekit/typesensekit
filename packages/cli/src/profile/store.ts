import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
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
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let file: Awaited<ReturnType<typeof open>> | undefined;

  try {
    file = await open(temporaryPath, "wx", 0o600);
    await file.writeFile(`${JSON.stringify(parsed, null, 2)}\n`);
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    await file?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function redactApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "***";
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
