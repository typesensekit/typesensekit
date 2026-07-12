import { describe, expect, it } from "vitest";
import { exportProfiles, mergeProfileImport } from "./portability.js";
import type { ProfileConfig } from "./store.js";

const config: ProfileConfig = {
  currentProfile: "local",
  profiles: {
    local: { url: "http://localhost:8108", apiKey: "secret-key" },
  },
};

describe("profile portability", () => {
  it("omits plaintext credentials from exports by default", () => {
    expect(exportProfiles(config, "local")).toEqual({
      name: "local",
      profile: { url: "http://localhost:8108", apiKey: undefined },
    });
  });

  it("reveals credentials only when explicitly requested", () => {
    expect(exportProfiles(config, "local", true)).toMatchObject({
      profile: { apiKey: "secret-key" },
    });
  });

  it("refuses overwrite unless explicitly allowed", () => {
    const imported = {
      name: "local",
      profile: { url: "https://new.example.com", apiKey: "new-key" },
    };
    expect(() => mergeProfileImport(config, imported)).toThrow("already exist");
    expect(mergeProfileImport(config, imported, true).profiles.local?.url).toBe(
      "https://new.example.com",
    );
  });

  it("merges a complete profile bundle", () => {
    const result = mergeProfileImport(config, {
      currentProfile: "production",
      profiles: {
        production: {
          url: "https://typesense.example.com",
          apiKeyKeychain: "production",
        },
      },
    });
    expect(result.profiles.production?.apiKeyKeychain).toBe("production");
    expect(result.currentProfile).toBe("local");
  });
});
