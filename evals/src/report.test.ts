import { describe, expect, it } from "vitest";
import { buildSummary, renderMarkdown } from "./report.js";
import type { AttemptRecord } from "./types.js";

// Synthetic fixtures for exercising the aggregation code only.
function attempt(overrides: Partial<AttemptRecord>): AttemptRecord {
  return {
    runId: "test",
    interface: "iface-a",
    model: "model-x",
    taskId: "search.one",
    category: "search",
    difficulty: "easy",
    mode: "read-only",
    repetition: 1,
    pass: true,
    failureMode: "passed",
    gradeDetail: "",
    finalAnswer: "1",
    turns: 2,
    toolsAvailable: 10,
    toolCalls: 3,
    discoveryCalls: 0,
    toolErrors: 0,
    errorsByKind: {
      denied: 0,
      unknown_tool: 0,
      invalid_args: 0,
      typesense: 0,
      other: 0,
    },
    duplicateCalls: 0,
    unknownOpCalls: 0,
    alternateToolMixes: 0,
    opsUsed: { documents_search: 1 },
    errorSamples: [],
    inputTokens: 100,
    cacheReadTokens: 50,
    cacheCreationTokens: 0,
    outputTokens: 20,
    costUsd: 0.01,
    wallMs: 1000,
    transcriptPath: "x.jsonl",
    startedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const meta = {
  runId: "test",
  startedAt: "a",
  finishedAt: "b",
  interfaces: ["iface-a"],
  models: ["model-x"],
  repetitions: 2,
  taskCount: 2,
  skipped: [],
  settings: {},
};

describe("buildSummary", () => {
  const attempts = [
    attempt({ repetition: 1, taskId: "search.one" }),
    attempt({
      repetition: 1,
      taskId: "debug.two",
      category: "debugging",
      pass: false,
      failureMode: "wrong_answer",
      toolErrors: 1,
      errorsByKind: {
        denied: 0,
        unknown_tool: 0,
        invalid_args: 1,
        typesense: 0,
        other: 0,
      },
      errorSamples: [
        {
          op: "documents_search",
          kind: "invalid_args",
          text: "Required at collection 12",
        },
      ],
    }),
    attempt({ repetition: 2, taskId: "search.one" }),
    attempt({ repetition: 2, taskId: "debug.two", category: "debugging" }),
  ];
  const summary = buildSummary(attempts, meta);

  it("computes mean and variance of per-repetition pass rates", () => {
    const [cell] = summary.cells;
    expect(cell?.perRepetitionPassRate).toEqual([0.5, 1]);
    expect(cell?.passRate).toBeCloseTo(0.75);
    expect(cell?.passRateVariance).toBeCloseTo(0.125);
    expect(cell?.mean.inputTokens).toBe(150);
    expect(cell?.totalCostUsd).toBeCloseTo(0.04);
  });

  it("breaks down by category and collects failure modes and errors", () => {
    const debugging = summary.categories.find(
      (c) => c.category === "debugging",
    );
    expect(debugging?.passRate).toBeCloseTo(0.5);
    expect(summary.failureModes[0]).toMatchObject({
      failureMode: "wrong_answer",
      count: 1,
      exampleTasks: ["debug.two"],
    });
    expect(summary.topErrors[0]?.signature).toBe("Required at collection #");
    expect(summary.toolUsage["iface-a"]?.documents_search).toBe(4);
  });

  it("renders markdown tables", () => {
    const markdown = renderMarkdown(summary);
    expect(markdown).toContain("| iface-a | model-x | 75.0% ± 35.4% | 3/4 |");
    expect(markdown).toContain("## Most common failure modes");
    expect(markdown).toContain("| debug.two | debugging | easy | 1/2 |");
  });
});
