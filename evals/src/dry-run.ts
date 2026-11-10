/**
 * `pnpm eval --dry-run`: validates the whole pipeline without calling a model.
 *
 * 1. Every answer task: the oracle resolves on a fresh seed, the grader
 *    accepts the expected answer (formatted the way an agent would write it)
 *    and rejects the task's decoy.
 * 2. Every state task: the check FAILS on a fresh seed, and PASSES after the
 *    reference solution is applied with direct HTTP calls. Reset in between.
 * 3. Every interface × mode: static inspection (MCP tool listing or CLI
 *    health) and an Agent SDK wiring probe with a deliberately invalid API
 *    key, which reads the session's init message (tools visible, MCP server
 *    status) and aborts before any billable call can succeed.
 */
import { type AgentSettings, startAgent } from "./agent.js";
import { describeSpec, gradeAnswer } from "./answer.js";
import { DRY_RUN_AUTH } from "./auth.js";
import { inspectInterface } from "./inspect.js";
import type { InterfaceConfig } from "./interfaces.js";
import { resolveExpected } from "./runner.js";
import { resetAndSeed } from "./seed.js";
import type { AnswerSpec, Mode, Task } from "./types.js";
import type { TypesenseHttp } from "./typesense.js";

export type CheckLine = { ok: boolean; label: string; detail: string };

/** Renders an expectation the way an agent would plausibly write it. */
export function formatAsAgentAnswer(spec: AnswerSpec): string {
  switch (spec.type) {
    case "text":
      return `**${spec.value}**`;
    case "number":
      return String(spec.value);
    case "set":
      return [...spec.values].reverse().join(", ");
    case "list":
      return spec.values.join(", ");
  }
}

export async function validateTasks(
  tasks: Task[],
  ts: TypesenseHttp,
): Promise<CheckLine[]> {
  const lines: CheckLine[] = [];
  for (const task of tasks) {
    try {
      await resetAndSeed(ts);
      if (task.kind === "answer") {
        const spec = await resolveExpected(task, ts);
        const good = gradeAnswer(formatAsAgentAnswer(spec), spec);
        const decoy = gradeAnswer(task.decoy, spec);
        lines.push({
          ok: good.pass && !decoy.pass,
          label: task.id,
          detail: `expected ${describeSpec(spec)}; grader ${good.pass ? "accepts" : "REJECTS"} it, ${decoy.pass ? "ACCEPTS" : "rejects"} decoy "${task.decoy}"`,
        });
      } else {
        const before = await task.check(ts);
        await task.reference(ts);
        const after = await task.check(ts);
        lines.push({
          ok: !before.pass && after.pass,
          label: task.id,
          detail: `fresh seed: ${before.pass ? "PASSES (not discriminative)" : `fails (${before.detail})`}; after reference: ${after.pass ? `passes (${after.detail})` : `FAILS (${after.detail})`}`,
        });
      }
    } catch (error) {
      lines.push({
        ok: false,
        label: task.id,
        detail: `threw: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  await resetAndSeed(ts);
  return lines;
}

export type WiringResult = {
  ok: boolean;
  tools: string[];
  mcpServers: { name: string; status: string }[];
  apiKeySource?: string;
  detail: string;
};

/** Starts a real Agent SDK session with an invalid key and reads its init message. */
export async function probeWiring(
  config: InterfaceConfig,
  mode: Mode,
  ts: TypesenseHttp,
  model: string,
): Promise<WiringResult> {
  const settings: AgentSettings = {
    model,
    maxTurns: 1,
    maxBudgetUsd: 0.01,
    timeoutMs: 60_000,
    auth: DRY_RUN_AUTH,
  };
  const session = startAgent({
    prompt: "Reply with FINAL ANSWER: ok",
    config,
    mode,
    ts,
    settings,
  });
  const timer = setTimeout(() => session.abort(), settings.timeoutMs);
  try {
    for await (const message of session.messages) {
      if (message.type === "system" && message.subtype === "init") {
        session.abort();
        const mcpServers = message.mcp_servers.map((s) => ({
          name: s.name,
          status: s.status,
        }));
        const serverOk =
          config.kind !== "mcp" ||
          mcpServers.some((s) => s.status === "connected");
        const tools = message.tools;
        const ifaceTools =
          config.kind === "mcp"
            ? tools.filter((t) => t.startsWith("mcp__"))
            : tools.filter((t) => t === "Bash");
        const extra = tools.filter(
          (t) =>
            !t.startsWith("mcp__") &&
            t !== "Bash" &&
            t !== "ListMcpResourcesTool" &&
            t !== "ReadMcpResourceTool",
        );
        return {
          ok: serverOk && ifaceTools.length > 0 && extra.length === 0,
          tools,
          mcpServers,
          apiKeySource: message.apiKeySource,
          detail: `${tools.length} tools visible (${ifaceTools.length} interface tools${extra.length ? `; unexpected: ${extra.join(", ")}` : ""}); MCP servers: ${mcpServers.map((s) => `${s.name}=${s.status}`).join(", ") || "none"}`,
        };
      }
    }
    return {
      ok: false,
      tools: [],
      mcpServers: [],
      detail: `no init message; stderr: ${session.stderr.join("").slice(-500)}`,
    };
  } catch (error) {
    return {
      ok: false,
      tools: [],
      mcpServers: [],
      detail: `session failed before init: ${error instanceof Error ? error.message : String(error)}; stderr: ${session.stderr.join("").slice(-500)}`,
    };
  } finally {
    clearTimeout(timer);
    session.cleanup();
  }
}

export async function validateInterfaces(
  configs: InterfaceConfig[],
  ts: TypesenseHttp,
  model: string,
): Promise<{ lines: CheckLine[]; inspections: unknown[] }> {
  const lines: CheckLine[] = [];
  const inspections: unknown[] = [];
  for (const config of configs) {
    for (const mode of Object.keys(config.modes) as Mode[]) {
      const label = `${config.name} [${mode}]`;
      try {
        const inspection = await inspectInterface(config, mode, ts, model);
        inspections.push(inspection);
        const summary =
          inspection.kind === "mcp"
            ? `${inspection.toolCount} tools, ${inspection.definitionChars} chars of tool definitions (${inspection.tokensExact ? "" : "≈"}${inspection.definitionTokens} tokens), ${inspection.shortDescriptions} descriptions < ${inspection.shortDescriptionThreshold} chars, ${inspection.dottedNames} dotted names, untyped params on ${inspection.untypedParams.length} tools`
            : `health ${inspection.healthy ? "ok" : "FAILED"} (${inspection.healthOutput}); \`operations\` lists ${inspection.operationsCount} lines / ${inspection.operationsListingChars} chars`;
        lines.push({
          ok:
            inspection.kind === "mcp"
              ? inspection.toolCount > 0
              : inspection.healthy,
          label: `inspect ${label}`,
          detail: summary,
        });
      } catch (error) {
        lines.push({
          ok: false,
          label: `inspect ${label}`,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      const wiring = await probeWiring(config, mode, ts, model);
      inspections.push({
        kind: "agent-wiring",
        interface: config.name,
        mode,
        apiKeySource: wiring.apiKeySource,
        mcpServers: wiring.mcpServers,
        tools: wiring.tools,
      });
      lines.push({
        ok: wiring.ok,
        label: `agent wiring ${label}`,
        detail: `${wiring.detail}; key source: ${wiring.apiKeySource ?? "unknown"}`,
      });
    }
  }
  return { lines, inspections };
}
