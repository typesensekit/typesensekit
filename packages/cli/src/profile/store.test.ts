import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, redactApiKey, saveConfig } from "./store.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("profile store", () => {
  it("returns an empty config when the file does not exist", async () => {
    dir = await mkdtemp(join(tmpdir(), "typesensekit-"));
    await expect(loadConfig(join(dir, "missing.json"))).resolves.toEqual({
      profiles: {},
    });
  });

  it("saves validated config with 0600 permissions", async () => {
    dir = await mkdtemp(join(tmpdir(), "typesensekit-"));
    const path = join(dir, "config.json");
    await saveConfig(
      {
        currentProfile: "local",
        profiles: { local: { url: "http://localhost:8108", apiKey: "xyz" } },
      },
      path,
    );
    await expect(readFile(path, "utf8")).resolves.toContain("localhost");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("repairs permissions when atomically replacing an existing config", async () => {
    dir = await mkdtemp(join(tmpdir(), "typesensekit-"));
    const path = join(dir, "config.json");
    await saveConfig({ profiles: {} }, path);
    await chmod(path, 0o644);

    await saveConfig(
      {
        currentProfile: "local",
        profiles: { local: { url: "http://localhost:8108", apiKey: "xyz" } },
      },
      path,
    );

    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(loadConfig(path)).resolves.toMatchObject({
      currentProfile: "local",
    });
  });

  it("redacts long and short api keys", () => {
    expect(redactApiKey("abcdef123456")).toBe("abcd…3456");
    expect(redactApiKey("short")).toBe("***");
  });

  it("accepts a keychain reference without persisting an API key", async () => {
    dir = await mkdtemp(join(tmpdir(), "typesensekit-"));
    const path = join(dir, "config.json");
    await saveConfig(
      {
        profiles: {
          production: {
            url: "https://typesense.example.com",
            apiKeyKeychain: "production",
          },
        },
      },
      path,
    );
    const raw = await readFile(path, "utf8");
    expect(raw).toContain('"apiKeyKeychain": "production"');
    expect(raw).not.toContain('"apiKey"');
  });
});
