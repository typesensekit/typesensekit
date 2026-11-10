/**
 * Static inspection of an interface under test. Costs nothing: it connects to
 * the MCP server (or runs the CLI) directly, without a model.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  buildMcpServer,
  type CliInterfaceConfig,
  type InterfaceConfig,
  type McpInterfaceConfig,
  prepareCliShell,
  templateVars,
} from "./interfaces.js";
import type { Mode } from "./types.js";
import type { TypesenseHttp } from "./typesense.js";

const exec = promisify(execFile);

export type McpInspection = {
  kind: "mcp";
  interface: string;
  mode: Mode;
  toolCount: number;
  definitionChars: number;
  /** Exact count via the token-counting API when a key is available, else chars/4. */
  definitionTokens: number;
  tokensExact: boolean;
  shortDescriptions: number;
  shortDescriptionThreshold: number;
  dottedNames: number;
  untypedParams: string[];
  examples: { name: string; description: string }[];
};

export type CliInspection = {
  kind: "cli";
  interface: string;
  mode: Mode;
  healthy: boolean;
  healthOutput: string;
  operationsListingChars: number;
  operationsCount: number;
};

const SHORT = 40;

/** Tool names the Messages API accepts; the harness only uses this for token counting. */
const apiSafeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);

async function countToolTokens(
  tools: { name: string; description?: string; inputSchema: unknown }[],
  model: string,
): Promise<number | undefined> {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;
  const client = new Anthropic();
  const definitions = tools.map((tool) => ({
    name: apiSafeName(tool.name),
    description: tool.description ?? "",
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: "hi" }];
  const [withTools, without] = await Promise.all([
    client.messages.countTokens({ model, messages, tools: definitions }),
    client.messages.countTokens({ model, messages }),
  ]);
  return withTools.input_tokens - without.input_tokens;
}

export async function inspectMcp(
  config: McpInterfaceConfig,
  mode: Mode,
  ts: TypesenseHttp,
  model: string,
): Promise<McpInspection> {
  const server = buildMcpServer(config, mode, templateVars(ts));
  const client = new Client({
    name: "typesensekit-evals-inspect",
    version: "0",
  });
  const transport =
    server.type === "stdio"
      ? new StdioClientTransport({
          command: server.command,
          args: server.args,
          env: server.env,
          stderr: "ignore",
        })
      : new StreamableHTTPClientTransport(new URL(server.url), {
          requestInit: { headers: server.headers },
        });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const definitions = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
    const definitionChars = JSON.stringify(definitions).length;
    let exact: number | undefined;
    try {
      exact = await countToolTokens(tools, model);
    } catch {
      exact = undefined;
    }
    const untypedParams = tools
      .filter((tool) => {
        const props = (tool.inputSchema.properties ?? {}) as Record<
          string,
          { type?: string; properties?: unknown; description?: string }
        >;
        return Object.values(props).some(
          (prop) =>
            prop?.type === "object" && !prop.properties && !prop.description,
        );
      })
      .map((tool) => tool.name);
    return {
      kind: "mcp",
      interface: config.name,
      mode,
      toolCount: tools.length,
      definitionChars,
      definitionTokens: exact ?? Math.round(definitionChars / 4),
      tokensExact: exact !== undefined,
      shortDescriptions: tools.filter(
        (t) => (t.description ?? "").length < SHORT,
      ).length,
      shortDescriptionThreshold: SHORT,
      dottedNames: tools.filter((t) => t.name.includes(".")).length,
      untypedParams,
      examples: tools
        .filter((t) => /search/.test(t.name))
        .slice(0, 4)
        .map((t) => ({ name: t.name, description: t.description ?? "" })),
    };
  } finally {
    await client.close();
  }
}

export async function inspectCli(
  config: CliInterfaceConfig,
  mode: Mode,
  ts: TypesenseHttp,
): Promise<CliInspection> {
  const bin = mkdtempSync(join(tmpdir(), "tsk-eval-inspect-"));
  try {
    const env = {
      ...prepareCliShell(config, mode, templateVars(ts), bin),
      HOME: bin,
    };
    const [command] = Object.keys(config.commands);
    if (!command) throw new Error(`${config.name} defines no commands`);
    const run = (args: string[]) =>
      exec(join(bin, command), args, { env, timeout: 30_000 }).then(
        (r) => ({ ok: true, out: r.stdout + r.stderr }),
        (e: { stdout?: string; stderr?: string; message: string }) => ({
          ok: false,
          out: `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message,
        }),
      );
    const health = await run(["health"]);
    const operations = await run(["operations"]);
    return {
      kind: "cli",
      interface: config.name,
      mode,
      healthy: health.ok && /"ok"\s*:\s*true|ok/i.test(health.out),
      healthOutput: health.out.trim().slice(0, 200),
      operationsListingChars: operations.out.length,
      operationsCount: operations.out.split("\n").filter((l) => l.trim())
        .length,
    };
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

/** Runs the CLI's `opsListCommand` and returns the operation names it lists. */
export async function loadCliOps(
  config: CliInterfaceConfig,
  ts: TypesenseHttp,
): Promise<string[]> {
  const [command] = Object.keys(config.commands);
  if (!command || !config.opsListCommand) return [];
  const bin = mkdtempSync(join(tmpdir(), "tsk-eval-ops-"));
  try {
    const env = {
      ...prepareCliShell(config, "read-only", templateVars(ts), bin),
      HOME: bin,
    };
    const { stdout } = await exec(join(bin, command), config.opsListCommand, {
      env,
      timeout: 30_000,
    });
    return stdout
      .split("\n")
      .map((line) => /^([A-Za-z][\w.-]*)(?:\s|$)/.exec(line.trim())?.[1])
      .filter((name): name is string => Boolean(name));
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
}

export async function inspectInterface(
  config: InterfaceConfig,
  mode: Mode,
  ts: TypesenseHttp,
  model: string,
): Promise<McpInspection | CliInspection> {
  return config.kind === "mcp"
    ? inspectMcp(config, mode, ts, model)
    : inspectCli(config, mode, ts);
}
