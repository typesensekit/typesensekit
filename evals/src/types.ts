import type { TypesenseHttp } from "./typesense.js";

/** Cluster permissions a task needs. Interfaces map each mode to their own config. */
export type Mode = "read-only" | "full-access";

export const CATEGORIES = [
  "discovery",
  "search",
  "facets",
  "multi-search",
  "lookup",
  "debugging",
  "config",
  "write",
] as const;
export type Category = (typeof CATEGORIES)[number];
export type Difficulty = "easy" | "medium" | "hard";

/** How the agent's `FINAL ANSWER:` value is compared to the expectation. */
export type AnswerSpec =
  /** Normalized exact match (case, whitespace, quotes, trailing period ignored). */
  | { type: "text"; value: string; alternatives?: string[] }
  /** Numeric match within an absolute tolerance (default 0). */
  | { type: "number"; value: number; tolerance?: number }
  /** Unordered, comma-separated values; must match exactly as a set. */
  | { type: "set"; values: string[] }
  /** Ordered, comma-separated values. */
  | { type: "list"; values: string[] };

export type StateCheckResult = { pass: boolean; detail: string };

type TaskBase = {
  /** Stable id, e.g. `search.cheapest-in-stock`. Used in filters and reports. */
  id: string;
  category: Category;
  difficulty: Difficulty;
  /** Natural-language prompt. Must not name any interface, tool, or command. */
  prompt: string;
};

export type AnswerTask = TaskBase & {
  kind: "answer";
  mode: "read-only";
  /** Static spec, or an oracle computed from the freshly seeded cluster. */
  expected: AnswerSpec | ((ts: TypesenseHttp) => Promise<AnswerSpec>);
  /** A plausible wrong answer; dry-run asserts the grader rejects it. */
  decoy: string;
};

export type StateTask = TaskBase & {
  kind: "state";
  mode: "full-access";
  /** Inspects the cluster after the agent finishes, with direct HTTP calls. */
  check: (ts: TypesenseHttp) => Promise<StateCheckResult>;
  /**
   * Reference solution applied with direct HTTP calls. Only used by
   * `--dry-run` to prove the check fails on a fresh seed and passes once the
   * task is actually done.
   */
  reference: (ts: TypesenseHttp) => Promise<void>;
  /**
   * Optional plausible-but-wrong end state, applied with direct HTTP. Only
   * used by `--dry-run`, which asserts the check FAILS on it.
   */
  decoy?: (ts: TypesenseHttp) => Promise<void>;
};

export type Task = AnswerTask | StateTask;

/**
 * denied: blocked by the harness sandbox. unknown_tool: unknown, or known but
 * unavailable/legacy (a wrong tool choice). invalid_args: schema/JSON/flag
 * validation before reaching Typesense. typesense: the cluster rejected the
 * request. other: anything else.
 */
export type ErrorKind =
  | "denied"
  | "unknown_tool"
  | "invalid_args"
  | "typesense"
  | "other";

export type ToolCallRecord = {
  /** Tool name as the model saw it (e.g. `mcp__ts__documents.search`, `Bash`). */
  tool: string;
  /** Interface-level operation(s), e.g. `documents.search` or `tsk documents.search`. */
  ops: string[];
  /** Referenced operations that do not exist (e.g. a guessed CLI subcommand). */
  unknownOps: string[];
  /** Pure discovery/help calls (`--help`, `--schema`, `operations`, ...). */
  discovery: boolean;
  input: unknown;
  isError: boolean;
  errorKind?: ErrorKind;
  /** First 500 chars of the result, for failure-mode analysis. */
  resultPreview: string;
};

export type FailureMode =
  | "passed"
  | "no_final_answer"
  | "wrong_answer"
  | "state_not_reached"
  | "max_turns"
  | "budget_exceeded"
  | "timeout"
  | "agent_error"
  /** The harness itself failed (seeding, oracle, session setup); not the agent. */
  | "harness_error";

export type AttemptRecord = {
  runId: string;
  interface: string;
  model: string;
  taskId: string;
  category: Category;
  difficulty: Difficulty;
  mode: Mode;
  repetition: number;
  pass: boolean;
  failureMode: FailureMode;
  gradeDetail: string;
  finalAnswer: string | null;
  turns: number;
  /** Tools the model could see (from the SDK init message). */
  toolsAvailable: number;
  toolCalls: number;
  discoveryCalls: number;
  toolErrors: number;
  errorsByKind: Record<ErrorKind, number>;
  duplicateCalls: number;
  /** Calls that referenced a nonexistent operation (wrong-tool guesses). */
  unknownOpCalls: number;
  /** Calls to more than one tool from an interface-declared equivalence group. */
  alternateToolMixes: number;
  opsUsed: Record<string, number>;
  /** Up to 8 tool errors (op, kind, first line) for failure-mode analysis. */
  errorSamples: { op: string; kind: ErrorKind; text: string }[];
  inputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  costUsd: number;
  wallMs: number;
  transcriptPath: string;
  startedAt: string;
};
