import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerConfig } from "./resolve.js";
import { saveConfig } from "./store.js";

let dir: string | undefined;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("profile resolution", () => {
  it("uses complete environment credentials by default", async () => {
    vi.stubEnv("TYPESENSE_URL", "https://environment.example.com");
    vi.stubEnv("TYPESENSE_API_KEY", "environment-key");

    await expect(resolveServerConfig()).resolves.toEqual({
      url: "https://environment.example.com",
      apiKey: "environment-key",
    });
  });

  it("prefers an explicitly selected profile over the environment", async () => {
    dir = await mkdtemp(join(tmpdir(), "typesensekit-"));
    const path = join(dir, "config.json");
    await saveConfig(
      {
        currentProfile: "local",
        profiles: {
          local: { url: "http://localhost:8108", apiKey: "profile-key" },
        },
      },
      path,
    );
    vi.stubEnv("TYPESENSE_URL", "https://environment.example.com");
    vi.stubEnv("TYPESENSE_API_KEY", "environment-key");

    await expect(
      resolveServerConfig({ profile: "local", config: path }),
    ).resolves.toEqual({
      url: "http://localhost:8108",
      apiKey: "profile-key",
    });
  });

  it("uses the current profile from an explicitly selected config", async () => {
    dir = await mkdtemp(join(tmpdir(), "typesensekit-"));
    const path = join(dir, "config.json");
    await saveConfig(
      {
        currentProfile: "local",
        profiles: {
          local: { url: "http://localhost:8108", apiKey: "profile-key" },
        },
      },
      path,
    );
    vi.stubEnv("TYPESENSE_URL", "https://environment.example.com");
    vi.stubEnv("TYPESENSE_API_KEY", "environment-key");

    await expect(resolveServerConfig({ config: path })).resolves.toMatchObject({
      apiKey: "profile-key",
    });
  });
});
