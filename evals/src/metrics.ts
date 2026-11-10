import type { InterfaceConfig } from "./interfaces.js";
import { MCP_TOOL_PREFIX } from "./interfaces.js";
import type { ErrorKind, ToolCallRecord } from "./types.js";

/**
 * Loose structural view of Agent SDK messages. The harness only reads a few
 * fields, and keeping this local means transcripts written by older SDK
 * versions can still be re-analyzed.
 */
export type TranscriptMessage = {
  type: string;
  subtype?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: unknown };
  [key: string]: unknown;
};

type ToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
};
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  is_error?: boolean;
  content?: unknown;
};

export const DEFAULT_ERROR_PATTERNS: [ErrorKind, RegExp][] = [
  [
    "denied",
    /Blocked by sandbox|hook (?:blocked|denied)|PreToolUse|Permission to use .* (?:was )?denied/i,
  ],
  [
    "unknown_tool",
    // Unknown, or known but unavailable/legacy for this cluster: a wrong tool choice.
    /No such tool|Unknown tool|tool .{0,60} not found|is not a valid (?:operation|command)|Unknown command|command not found|Invalid command|Unknown operation|(?:is|are) (?:unavailable|not available|unsupported|deprecated)/i,
  ],
  [
    "invalid_args",
    /Input validation error|Invalid arguments|invalid_type|Invalid input|Invalid JSON|Expected [a-z ]+, received|Unrecognized key|\bRequired\b|ZodError|Unexpected token|is not valid JSON|JSON\.parse|Unknown (?:option|argument|flag)|MCP error -32602|must be (?:an?|of) |without confirmation/i,
  ],
  [
    "typesense",
    // Specific on purpose: a bare "Typesense" also appears in CLI help banners.
    /Request failed with HTTP code|Server said:|Typesense \d{3}|\bHTTP (?:code |status )?\d{3}\b|Could not find|Collection not found|ObjectNotFound|ObjectUnprocessable|RequestMalformed|Cannot (?:filter|sort|facet)|No search fields/i,
  ],
];

export function classifyError(
  text: string,
  config?: Pick<InterfaceConfig, "errorPatterns">,
): ErrorKind {
  const custom = Object.entries(config?.errorPatterns ?? {}).map(
    ([kind, pattern]) => [kind as ErrorKind, new RegExp(pattern, "i")] as const,
  );
  for (const [kind, pattern] of [...custom, ...DEFAULT_ERROR_PATTERNS]) {
    if (pattern.test(text)) return kind;
  }
  return "other";
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : "",
      )
      .join("\n");
  }
  return content === undefined ? "" : JSON.stringify(content);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Naive (quote-unaware) split; good enough for attributing ops in metrics. */
function commandSegments(command: string): string[] {
  return command
    .split(/\|\|?|&&|;|\n/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Canonical operation name shared by all arms. Claude Code exposes MCP tool
 * names with characters outside [A-Za-z0-9_-] replaced by "_" (so the
 * model calls `documents_search`, not `documents.search`); CLI commands keep
 * the dots. Canonicalizing both makes op stats and tool groups comparable.
 */
export function canonicalOp(op: string): string {
  return op.replace(/[^A-Za-z0-9_-]/g, "_");
}

export type CallOps = {
  /** Valid operations the call ran (canonicalized). */
  ops: string[];
  /** Operations the call referenced that the interface does not have. */
  unknownOps: string[];
  discovery: boolean;
};

export function opsForCall(
  tool: string,
  input: unknown,
  config: InterfaceConfig,
): CallOps {
  if (tool.startsWith(MCP_TOOL_PREFIX)) {
    return {
      ops: [canonicalOp(tool.slice(MCP_TOOL_PREFIX.length))],
      unknownOps: [],
      discovery: false,
    };
  }
  if (tool === "Bash" && config.kind === "cli") {
    const command = String((input as { command?: unknown })?.command ?? "");
    const opPattern = config.opPattern ? new RegExp(config.opPattern) : null;
    const discoveryPattern = config.discoveryPattern
      ? new RegExp(config.discoveryPattern)
      : null;
    const known = config.validOps
      ? new Set(
          [...config.validOps, ...(config.builtinCommands ?? [])].map(
            canonicalOp,
          ),
        )
      : null;
    const ops: string[] = [];
    const unknownOps: string[] = [];
    let interfaceSegments = 0;
    let discoverySegments = 0;
    for (const segment of commandSegments(command)) {
      const program = segment.split(/\s+/)[0] ?? "";
      if (!(program in config.commands)) continue;
      interfaceSegments++;
      const match = opPattern?.exec(segment);
      let op = match?.[1] ? canonicalOp(match[1]) : undefined;
      // Space-separated forms (`tsk collections list`) resolve to the
      // longest valid op, for CLIs that accept them.
      if (op && known && !known.has(op)) {
        const words = segment.split(/\s+/).slice(1);
        const bare: string[] = [];
        for (const word of words) {
          if (!/^[A-Za-z][\w.-]*$/.test(word)) break;
          bare.push(word);
        }
        for (let size = bare.length; size > 1; size--) {
          const candidate = canonicalOp(bare.slice(0, size).join("."));
          if (known.has(candidate)) {
            op = candidate;
            break;
          }
        }
      }
      // A token that is not a valid op (even in a --help call). Counted as a
      // wrong guess only if the call failed; see analyzeTranscript.
      if (op && known && !known.has(op)) unknownOps.push(op);
      if (discoveryPattern?.test(segment)) {
        discoverySegments++;
        continue;
      }
      if (op && !unknownOps.includes(op)) ops.push(op);
    }
    return {
      ops,
      unknownOps,
      discovery:
        interfaceSegments > 0 && discoverySegments === interfaceSegments,
    };
  }
  return { ops: [tool], unknownOps: [], discovery: false };
}

export type TranscriptAnalysis = {
  calls: ToolCallRecord[];
  duplicateCalls: number;
  alternateToolMixes: number;
  opsUsed: Record<string, number>;
  errorsByKind: Record<ErrorKind, number>;
  /** Calls that referenced at least one nonexistent operation. */
  unknownOpCalls: number;
};

export function analyzeTranscript(
  messages: TranscriptMessage[],
  config: InterfaceConfig,
): TranscriptAnalysis {
  const uses = new Map<string, ToolUseBlock>();
  const order: string[] = [];
  const results = new Map<string, ToolResultBlock>();
  for (const message of messages) {
    // Top-level conversation only; subagents are disabled anyway.
    if (message.parent_tool_use_id) continue;
    const content = message.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as { type?: string }[]) {
      if (message.type === "assistant" && block.type === "tool_use") {
        const use = block as ToolUseBlock;
        if (!uses.has(use.id)) order.push(use.id);
        uses.set(use.id, use);
      } else if (message.type === "user" && block.type === "tool_result") {
        const result = block as ToolResultBlock;
        results.set(result.tool_use_id, result);
      }
    }
  }

  const errorsByKind: Record<ErrorKind, number> = {
    denied: 0,
    unknown_tool: 0,
    invalid_args: 0,
    typesense: 0,
    other: 0,
  };
  const seen = new Set<string>();
  let duplicateCalls = 0;
  const opsUsed: Record<string, number> = {};
  const calls: ToolCallRecord[] = order.map((id) => {
    const use = uses.get(id) as ToolUseBlock;
    const result = results.get(id);
    const text = resultText(result?.content);
    const call = opsForCall(use.name, use.input, config);
    const { ops, discovery } = call;
    const isError = result?.is_error === true;
    // An unrecognized token the interface accepted (e.g. group help) is not
    // a wrong guess; only rejected ones count.
    const unknownOps = isError ? call.unknownOps : [];
    const key = `${use.name}:${stableStringify(use.input)}`;
    if (seen.has(key)) duplicateCalls++;
    seen.add(key);
    for (const op of ops) opsUsed[op] = (opsUsed[op] ?? 0) + 1;
    const errorKind = isError
      ? unknownOps.length > 0
        ? "unknown_tool"
        : classifyError(text, config)
      : undefined;
    if (errorKind) errorsByKind[errorKind]++;
    return {
      tool: use.name,
      ops,
      unknownOps,
      discovery,
      input: use.input,
      isError,
      errorKind,
      resultPreview: text.slice(0, 500),
    };
  });

  let alternateToolMixes = 0;
  for (const group of config.toolGroups ?? []) {
    const used = group.map(canonicalOp).filter((op) => (opsUsed[op] ?? 0) > 0);
    if (used.length > 1) alternateToolMixes++;
  }

  return {
    calls,
    duplicateCalls,
    alternateToolMixes,
    opsUsed,
    errorsByKind,
    unknownOpCalls: calls.filter((call) => call.unknownOps.length > 0).length,
  };
}
