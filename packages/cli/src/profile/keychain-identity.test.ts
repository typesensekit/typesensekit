import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "citty";
import { afterEach, expect, it, vi } from "vitest";
import { profileCommand, renameProfile } from "./commands.js";
import { saveKeychainApiKey } from "./credentials.js";
import { loadConfig, saveConfig } from "./store.js";

vi.mock("./credentials.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./credentials.js")>()),
  saveKeychainApiKey: vi.fn(async () => undefined),
}));
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it("isolates same-name profiles and migrates legacy references on save", async () => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const dir = await mkdtemp(join(tmpdir(), "tsk-keychain-test-"));
  dirs.push(dir);
  const first = join(dir, "first.json");
  const second = join(dir, "second.json");
  await saveConfig(
    {
      profiles: {
        production: {
          url: "http://localhost:8108",
          apiKeyKeychain: "production",
        },
      },
    },
    first,
  );
  for (const config of [first, second]) {
    await runCommand(profileCommand, {
      rawArgs: [
        "add",
        "production",
        "--url",
        "http://localhost:8108",
        "--api-key",
        "fake-key",
        "--keychain",
        "--config",
        config,
      ],
    });
  }
  const a = await loadConfig(first);
  const b = await loadConfig(second);
  const reference = a.profiles.production?.apiKeyKeychain;
  expect(reference).toBeTruthy();
  expect(reference).not.toBe("production");
  expect(reference).not.toBe(b.profiles.production?.apiKeyKeychain);
  expect(saveKeychainApiKey).toHaveBeenCalledWith(reference, "fake-key");
  renameProfile(a, "production", "renamed");
  expect(a.profiles.renamed?.apiKeyKeychain).toBe(reference);
  await saveConfig(a, first);
  await runCommand(profileCommand, {
    rawArgs: [
      "add",
      "production",
      "--url",
      "http://localhost:8108",
      "--api-key",
      "fake-key",
      "--keychain",
      "--config",
      first,
    ],
  });
  const updated = await loadConfig(first);
  expect(updated.profiles.renamed?.apiKeyKeychain).toBe(reference);
  expect(updated.profiles.production?.apiKeyKeychain).not.toBe(reference);
});
