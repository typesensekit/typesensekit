import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuth } from "./auth.js";

const VARS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
];

function withEnv(values: Record<string, string>) {
  for (const name of VARS) vi.stubEnv(name, values[name] ?? "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAuth", () => {
  it("prefers an API key, then an OAuth token, then an auth token", () => {
    withEnv({ CLAUDE_CODE_OAUTH_TOKEN: "o", ANTHROPIC_AUTH_TOKEN: "t" });
    expect(resolveAuth("auto")).toMatchObject({
      mode: "oauth-token",
      env: { CLAUDE_CODE_OAUTH_TOKEN: "o" },
      isolateHome: true,
    });
    withEnv({ ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "t" });
    expect(resolveAuth("auto").mode).toBe("api-key");
  });

  it("passes the base URL along and names only its host", () => {
    withEnv({
      ANTHROPIC_AUTH_TOKEN: "t",
      ANTHROPIC_BASE_URL: "https://gateway.example.com/v1",
    });
    const auth = resolveAuth("auto");
    expect(auth.env).toEqual({
      ANTHROPIC_AUTH_TOKEN: "t",
      ANTHROPIC_BASE_URL: "https://gateway.example.com/v1",
    });
    expect(auth.description).toBe(
      "ANTHROPIC_AUTH_TOKEN via gateway.example.com",
    );
  });

  it("uses the keychain login without isolating HOME", () => {
    withEnv({ ANTHROPIC_API_KEY: "k" });
    expect(resolveAuth("claude-login")).toMatchObject({
      mode: "claude-login",
      env: {},
      isolateHome: false,
    });
  });

  it("explains how to get credentials when none are set", () => {
    withEnv({});
    expect(() => resolveAuth("auto")).toThrow(/claude setup-token/);
    expect(() => resolveAuth("api-key")).toThrow(/ANTHROPIC_API_KEY/);
  });
});
