import { describe, expect, it } from "vitest";
import { removeProfile, renameProfile } from "./commands.js";
import type { ProfileConfig } from "./store.js";

function config(): ProfileConfig {
  return {
    currentProfile: "local",
    profiles: {
      local: { url: "http://localhost:8108", apiKey: "local-key" },
      production: {
        url: "https://production.example.com",
        apiKey: "production-key",
      },
    },
  };
}

describe("profile mutations", () => {
  it("refuses to remove a missing profile", () => {
    expect(() => removeProfile(config(), "missing")).toThrow(
      "Profile not found: missing",
    );
  });

  it("selects another profile when removing the current profile", () => {
    const cfg = config();
    removeProfile(cfg, "local");
    expect(cfg.currentProfile).toBe("production");
  });

  it("refuses to overwrite an existing profile during rename", () => {
    expect(() => renameProfile(config(), "local", "production")).toThrow(
      "Profile already exists: production",
    );
  });

  it("renames a profile and preserves current selection", () => {
    const cfg = config();
    renameProfile(cfg, "local", "development");
    expect(cfg.currentProfile).toBe("development");
    expect(cfg.profiles.development).toMatchObject({ apiKey: "local-key" });
    expect(cfg.profiles.local).toBeUndefined();
  });
});
