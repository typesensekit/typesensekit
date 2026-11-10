/**
 * "Interfaces under test" are plain JSON configs in `evals/interfaces/`.
 * Nothing in tasks or graders knows which interface is running; everything
 * interface-specific (server command, env, prompt hint, op naming, error
 * patterns) lives in the config.
 */
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { EVALS_ROOT, REPO_ROOT } from "./paths.js";
import type { ErrorKind, Mode } from "./types.js";
import type { TypesenseHttp } from "./typesense.js";

export type McpServerSpec =
  | {
      type: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | { type: "http"; url: string; headers?: Record<string, string> };

export type ModeSpec = {
  /** Extra env for the MCP server (stdio) or the shell (cli) in this mode. */
  env?: Record<string, string>;
  /** Extra headers for an HTTP MCP server in this mode. */
  headers?: Record<string, string>;
};

type InterfaceBase = {
  name: string;
  description?: string;
  /** Modes this interface supports. Tasks in a missing mode are skipped. */
  modes: Partial<Record<Mode, ModeSpec>>;
  /** Appended to the shared system prompt. Keep it to what a user would say. */
  promptHint?: string;
  /**
   * Groups of operations that do the same job (e.g. two search tools).
   * Using more than one member of a group in one attempt is counted as an
   * alternate-tool mix, a wrong/duplicate tool-choice signal.
   */
  toolGroups?: string[][];
  /** Extra regexes (case-insensitive) checked before the defaults. */
  errorPatterns?: Partial<Record<ErrorKind, string>>;
  /** Files that must exist before running (e.g. built dist files). */
  requires?: string[];
};

export type McpInterfaceConfig = InterfaceBase & {
  kind: "mcp";
  server: McpServerSpec;
  /** Keep every tool definition in the prompt (no tool-search deferral). Default true. */
  alwaysLoadTools?: boolean;
  /** Also expose the built-in MCP resource list/read tools. Default false. */
  allowResources?: boolean;
};

export type CliInterfaceConfig = InterfaceBase & {
  kind: "cli";
  /** Executables placed on PATH as shims, e.g. { "tsk": { command, args } }. */
  commands: Record<string, { command: string; args?: string[] }>;
  /** Every command the agent may run, including shims and system tools. */
  allowedCommands: string[];
  env?: Record<string, string>;
  /** Regex with one capture group naming the operation in a command segment. */
  opPattern?: string;
  /** Regex marking a command segment as pure discovery/help. */
  discoveryPattern?: string;
};

export type InterfaceConfig = McpInterfaceConfig | CliInterfaceConfig;

/** MCP server key used for every MCP arm so tool prefixes are identical. */
export const MCP_SERVER_KEY = "typesense";
export const MCP_TOOL_PREFIX = `mcp__${MCP_SERVER_KEY}__`;

const interfacesDir = join(EVALS_ROOT, "interfaces");

export function listInterfaces(): InterfaceConfig[] {
  return readdirSync(interfacesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map(
      (file) =>
        JSON.parse(
          readFileSync(join(interfacesDir, file), "utf8"),
        ) as InterfaceConfig,
    );
}

/** `mcp` / `cli` / `both` shortcuts, or comma-separated interface names. */
export function resolveInterfaces(selector: string): InterfaceConfig[] {
  const all = listInterfaces();
  const byName = new Map(all.map((config) => [config.name, config]));
  const aliases: Record<string, string[]> = {
    mcp: ["typesensekit-mcp"],
    cli: ["typesensekit-cli"],
    both: ["typesensekit-mcp", "typesensekit-cli"],
    all: all.map((config) => config.name),
  };
  const names = selector
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => aliases[part] ?? [part]);
  return [...new Set(names)].map((name) => {
    const config = byName.get(name);
    if (!config) {
      throw new Error(
        `Unknown interface "${name}". Available: ${[...byName.keys()].join(", ")}`,
      );
    }
    return config;
  });
}

export type TemplateVars = Record<string, string>;

export function templateVars(ts: TypesenseHttp): TemplateVars {
  const url = new URL(ts.url);
  return {
    TYPESENSE_URL: ts.url,
    TYPESENSE_API_KEY: ts.apiKey,
    TYPESENSE_HOST: url.hostname,
    TYPESENSE_PORT: url.port,
    TYPESENSE_PROTOCOL: url.protocol.replace(":", ""),
    REPO_ROOT,
    EVALS_ROOT,
    NODE: process.execPath,
  };
}

/** Expands `${NAME}` from vars and `${env:NAME}` from process.env. */
export function expand(value: string, vars: TemplateVars): string {
  return value.replace(/\$\{(env:)?([A-Za-z0-9_]+)\}/g, (_match, env, name) => {
    const resolved = env ? process.env[name] : vars[name];
    if (resolved === undefined) {
      throw new Error(
        `Interface config references unset \${${env ?? ""}${name}}`,
      );
    }
    return resolved;
  });
}

function expandRecord(
  record: Record<string, string> | undefined,
  vars: TemplateVars,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record ?? {}).map(([key, value]) => [
      key,
      expand(value, vars),
    ]),
  );
}

export function missingRequirements(config: InterfaceConfig): string[] {
  const vars: TemplateVars = { REPO_ROOT, EVALS_ROOT, NODE: process.execPath };
  return (config.requires ?? [])
    .map((path) => expand(path, vars))
    .filter((path) => !existsSync(path));
}

export type McpServerOptions =
  | {
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
      alwaysLoad: boolean;
    }
  | {
      type: "http";
      url: string;
      headers: Record<string, string>;
      alwaysLoad: boolean;
    };

export function buildMcpServer(
  config: McpInterfaceConfig,
  mode: Mode,
  vars: TemplateVars,
): McpServerOptions {
  const modeSpec = config.modes[mode] ?? {};
  const alwaysLoad = config.alwaysLoadTools ?? true;
  if (config.server.type === "stdio") {
    return {
      type: "stdio",
      command: expand(config.server.command, vars),
      args: (config.server.args ?? []).map((arg) => expand(arg, vars)),
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        ...expandRecord(config.server.env, vars),
        ...expandRecord(modeSpec.env, vars),
      },
      alwaysLoad,
    };
  }
  return {
    type: "http",
    url: expand(config.server.url, vars),
    headers: {
      ...expandRecord(config.server.headers, vars),
      ...expandRecord(modeSpec.headers, vars),
    },
    alwaysLoad,
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Writes PATH shims for the CLI arm into `binDir` and returns the shell env.
 * PATH contains only the shim dir plus the system dirs needed for basic tools.
 */
export function prepareCliShell(
  config: CliInterfaceConfig,
  mode: Mode,
  vars: TemplateVars,
  binDir: string,
): Record<string, string> {
  for (const [name, spec] of Object.entries(config.commands)) {
    const argv = [spec.command, ...(spec.args ?? [])].map((part) =>
      shellQuote(expand(part, vars)),
    );
    const path = join(binDir, name);
    writeFileSync(path, `#!/bin/sh\nexec ${argv.join(" ")} "$@"\n`);
    chmodSync(path, 0o755);
  }
  return {
    PATH: `${binDir}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`,
    ...expandRecord(config.env, vars),
    ...expandRecord(config.modes[mode]?.env, vars),
  };
}
