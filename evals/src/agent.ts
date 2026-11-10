/**
 * Builds a Claude Agent SDK session for one interface under test.
 *
 * Isolation: each session gets a fresh HOME / CLAUDE_CONFIG_DIR / cwd under a
 * temp dir, loads no filesystem settings, skills, or user MCP servers, and
 * exposes only the interface's tools. A PreToolUse hook enforces the tool
 * allowlist (and the shell allowlist for CLI arms) independent of
 * permission mode.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type EffortLevel,
  type HookCallback,
  type Options,
  query,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  buildMcpServer,
  type InterfaceConfig,
  MCP_SERVER_KEY,
  MCP_TOOL_PREFIX,
  prepareCliShell,
  templateVars,
} from "./interfaces.js";
import { checkShellCommand } from "./shell-guard.js";
import type { Mode } from "./types.js";
import type { TypesenseHttp } from "./typesense.js";

export const SYSTEM_PROMPT = `You are an operations agent working on a Typesense search cluster (Typesense 30.2) through the tools available to you.

Complete the user's task by inspecting the cluster and, only when the task asks for it, changing it. Do not guess or rely on prior knowledge about the data: verify facts with your tools. Work efficiently.

When you are finished, end your reply with exactly one line of this form:
FINAL ANSWER: <answer>

Answer format rules:
- Give only the requested value(s): no explanation, units, or currency symbols on that line.
- Numbers are plain (e.g. 1234.5), without thousands separators.
- Separate multiple values with commas, in the order requested.
- If the task asks you to change something, make the change, verify it, then reply FINAL ANSWER: done`;

export const RESOURCE_TOOLS = ["ListMcpResourcesTool", "ReadMcpResourceTool"];

export type AgentSettings = {
  model: string;
  maxTurns: number;
  maxBudgetUsd: number;
  timeoutMs: number;
  effort?: EffortLevel;
  apiKey: string;
};

export type AgentSession = {
  messages: AsyncIterable<SDKMessage>;
  abort: () => void;
  cleanup: () => void;
  stderr: string[];
};

function allowedBuiltinTools(config: InterfaceConfig): string[] {
  if (config.kind === "cli") return ["Bash"];
  return config.allowResources ? RESOURCE_TOOLS : [];
}

function guardHook(config: InterfaceConfig): HookCallback {
  const builtins = new Set(allowedBuiltinTools(config));
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const deny = (reason: string) => ({
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: reason,
      },
    });
    const allow = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "allow" as const,
      },
    };
    const tool = input.tool_name;
    if (config.kind === "mcp" && tool.startsWith(MCP_TOOL_PREFIX)) return allow;
    if (!builtins.has(tool)) {
      return deny(`Blocked by sandbox: tool ${tool} is not available.`);
    }
    if (config.kind === "cli" && tool === "Bash") {
      const command = String(
        (input.tool_input as { command?: unknown })?.command ?? "",
      );
      const verdict = checkShellCommand(command, config.allowedCommands);
      if (!verdict.allowed) return deny(verdict.reason);
    }
    return allow;
  };
}

export function startAgent(params: {
  prompt: string;
  config: InterfaceConfig;
  mode: Mode;
  ts: TypesenseHttp;
  settings: AgentSettings;
}): AgentSession {
  const { config, mode, settings } = params;
  const root = mkdtempSync(join(tmpdir(), "tsk-eval-"));
  const home = join(root, "home");
  const cwd = join(root, "work");
  const bin = join(root, "bin");
  for (const dir of [home, cwd, bin]) mkdirSync(dir, { recursive: true });

  const vars = templateVars(params.ts);
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    TMPDIR: root,
    LANG: "en_US.UTF-8",
    SHELL: "/bin/bash",
    ANTHROPIC_API_KEY: settings.apiKey,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_AGENT_SDK_CLIENT_APP: "typesensekit-evals/0.0.0",
  };
  if (config.kind === "cli") {
    const shellEnv = prepareCliShell(config, mode, vars, bin);
    Object.assign(env, shellEnv, {
      // Keep node reachable for the Claude Code process itself.
      PATH: `${shellEnv.PATH}:${dirname(process.execPath)}`,
    });
  }

  const mcpServers: Options["mcpServers"] =
    config.kind === "mcp"
      ? { [MCP_SERVER_KEY]: buildMcpServer(config, mode, vars) }
      : {};

  const abortController = new AbortController();
  const stderr: string[] = [];
  const options: Options = {
    model: settings.model,
    systemPrompt: config.promptHint
      ? `${SYSTEM_PROMPT}\n\n${config.promptHint}`
      : SYSTEM_PROMPT,
    tools: allowedBuiltinTools(config),
    mcpServers,
    strictMcpConfig: true,
    settingSources: [],
    skills: [],
    persistSession: false,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    hooks: {
      PreToolUse: [{ hooks: [guardHook(config)], onFailure: "block" }],
    },
    maxTurns: settings.maxTurns,
    maxBudgetUsd: settings.maxBudgetUsd,
    ...(settings.effort ? { effort: settings.effort } : {}),
    cwd,
    env,
    abortController,
    stderr: (data) => {
      if (stderr.length < 200) stderr.push(data);
    },
  };

  return {
    messages: query({ prompt: params.prompt, options }),
    abort: () => abortController.abort(),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
    stderr,
  };
}
