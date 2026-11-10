/**
 * How agent sessions authenticate. Env-var credentials are passed into an
 * otherwise empty environment, so sessions keep their isolated temp HOME.
 * `claude-login` reuses the Claude Code login stored in the OS keychain,
 * which needs the real HOME and config dir, so it is opt-in.
 */
export const AUTH_MODES = [
  "auto",
  "api-key",
  "oauth-token",
  "auth-token",
  "claude-login",
] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export type ResolvedAuth = {
  mode: Exclude<AuthMode, "auto">;
  /** Variables added to the session env. */
  env: Record<string, string>;
  /** False only for claude-login, which must see the real HOME/config dir. */
  isolateHome: boolean;
  /** Human-readable source, without secret values. */
  description: string;
};

const SOURCES = {
  "api-key": "ANTHROPIC_API_KEY",
  "oauth-token": "CLAUDE_CODE_OAUTH_TOKEN",
  "auth-token": "ANTHROPIC_AUTH_TOKEN",
} as const;

function baseUrlEnv(): { env: Record<string, string>; note: string } {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return { env: {}, note: "" };
  let host = "custom endpoint";
  try {
    host = new URL(baseUrl).host;
  } catch {
    // Keep the generic label.
  }
  return { env: { ANTHROPIC_BASE_URL: baseUrl }, note: ` via ${host}` };
}

export function resolveAuth(requested: AuthMode): ResolvedAuth {
  if (requested === "claude-login") {
    return {
      mode: "claude-login",
      env: {},
      isolateHome: false,
      description:
        "Claude Code login from the OS keychain (sessions use your real HOME; settings, CLAUDE.md, skills, and MCP config are still not loaded)",
    };
  }
  const order =
    requested === "auto"
      ? (Object.keys(SOURCES) as (keyof typeof SOURCES)[])
      : [requested];
  for (const mode of order) {
    const name = SOURCES[mode];
    const value = process.env[name];
    if (!value) continue;
    const base = baseUrlEnv();
    return {
      mode,
      env: { [name]: value, ...base.env },
      isolateHome: true,
      description: `${name}${base.note}`,
    };
  }
  throw new Error(
    requested === "auto"
      ? "No credentials found. Set ANTHROPIC_API_KEY, run `claude setup-token` and export CLAUDE_CODE_OAUTH_TOKEN, set ANTHROPIC_AUTH_TOKEN, or pass --auth claude-login to reuse your Claude Code login. Use --dry-run to validate without model calls."
      : `--auth ${requested} needs ${SOURCES[requested]} to be set.`,
  );
}

/** Deliberately invalid credentials for the dry-run wiring probe. */
export const DRY_RUN_AUTH: ResolvedAuth = {
  mode: "api-key",
  env: { ANTHROPIC_API_KEY: "sk-ant-dry-run-invalid-key-0000000000" },
  isolateHome: true,
  description: "invalid dry-run key",
};
