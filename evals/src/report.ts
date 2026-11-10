import { groupBy, mean, stddev, sum, variance } from "./stats.js";
import type { AttemptRecord, ErrorKind, FailureMode } from "./types.js";

export type RunMeta = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  interfaces: string[];
  models: string[];
  repetitions: number;
  taskCount: number;
  skipped: { interface: string; taskId: string; reason: string }[];
  settings: Record<string, unknown>;
};

type CellStats = {
  interface: string;
  model: string;
  attempts: number;
  passes: number;
  /** Mean of per-repetition pass rates, and their sample variance. */
  passRate: number;
  passRateVariance: number;
  passRateStddev: number;
  perRepetitionPassRate: number[];
  mean: {
    turns: number;
    toolsAvailable: number;
    toolCalls: number;
    discoveryCalls: number;
    toolErrors: number;
    invalidArgErrors: number;
    typesenseErrors: number;
    unknownToolErrors: number;
    deniedCalls: number;
    duplicateCalls: number;
    unknownOpCalls: number;
    alternateToolMixes: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    wallSeconds: number;
  };
  totalCostUsd: number;
};

export type Summary = {
  meta: RunMeta;
  cells: CellStats[];
  categories: {
    interface: string;
    model: string;
    category: string;
    attempts: number;
    passRate: number;
    passRateStddev: number;
  }[];
  tasks: {
    taskId: string;
    category: string;
    difficulty: string;
    results: Record<string, { passes: number; attempts: number }>;
  }[];
  failureModes: {
    interface: string;
    model: string;
    failureMode: FailureMode;
    count: number;
    exampleTasks: string[];
  }[];
  topErrors: {
    interface: string;
    kind: ErrorKind;
    op: string;
    signature: string;
    count: number;
  }[];
  toolUsage: Record<string, Record<string, number>>;
};

const cellKey = (a: AttemptRecord) => `${a.interface}\u0000${a.model}`;

function passRates(attempts: AttemptRecord[]) {
  const byRep = groupBy(attempts, (a) => String(a.repetition));
  const rates = [...byRep.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, items]) => items.filter((a) => a.pass).length / items.length);
  return {
    rates,
    mean: mean(rates),
    variance: variance(rates),
    stddev: stddev(rates),
  };
}

function errorSignature(text: string): string {
  return text
    .replace(/"[^"]{0,80}"/g, '"…"')
    .replace(/`[^`]{0,80}`/g, "`…`")
    .replace(/\b[0-9a-f]{8,}\b/gi, "#")
    .replace(/\d+(\.\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function buildSummary(
  attempts: AttemptRecord[],
  meta: RunMeta,
): Summary {
  const cells: CellStats[] = [...groupBy(attempts, cellKey).values()].map(
    (items) => {
      const first = items[0] as AttemptRecord;
      const rates = passRates(items);
      const avg = (pick: (a: AttemptRecord) => number) => mean(items.map(pick));
      return {
        interface: first.interface,
        model: first.model,
        attempts: items.length,
        passes: items.filter((a) => a.pass).length,
        passRate: rates.mean,
        passRateVariance: rates.variance,
        passRateStddev: rates.stddev,
        perRepetitionPassRate: rates.rates,
        mean: {
          turns: avg((a) => a.turns),
          toolsAvailable: avg((a) => a.toolsAvailable),
          toolCalls: avg((a) => a.toolCalls),
          discoveryCalls: avg((a) => a.discoveryCalls),
          toolErrors: avg((a) => a.toolErrors),
          invalidArgErrors: avg((a) => a.errorsByKind.invalid_args),
          typesenseErrors: avg((a) => a.errorsByKind.typesense),
          unknownToolErrors: avg((a) => a.errorsByKind.unknown_tool),
          deniedCalls: avg((a) => a.errorsByKind.denied),
          duplicateCalls: avg((a) => a.duplicateCalls),
          unknownOpCalls: avg((a) => a.unknownOpCalls ?? 0),
          alternateToolMixes: avg((a) => a.alternateToolMixes),
          inputTokens: avg(
            (a) => a.inputTokens + a.cacheReadTokens + a.cacheCreationTokens,
          ),
          outputTokens: avg((a) => a.outputTokens),
          costUsd: avg((a) => a.costUsd),
          wallSeconds: avg((a) => a.wallMs / 1000),
        },
        totalCostUsd: sum(items.map((a) => a.costUsd)),
      };
    },
  );

  const categories = [
    ...groupBy(attempts, (a) => `${cellKey(a)}\u0000${a.category}`).values(),
  ].map((items) => {
    const first = items[0] as AttemptRecord;
    const rates = passRates(items);
    return {
      interface: first.interface,
      model: first.model,
      category: first.category,
      attempts: items.length,
      passRate: rates.mean,
      passRateStddev: rates.stddev,
    };
  });

  const tasks = [...groupBy(attempts, (a) => a.taskId).values()].map(
    (items) => {
      const first = items[0] as AttemptRecord;
      const results: Record<string, { passes: number; attempts: number }> = {};
      for (const [key, group] of groupBy(
        items,
        (a) => `${a.interface} · ${a.model}`,
      )) {
        results[key] = {
          passes: group.filter((a) => a.pass).length,
          attempts: group.length,
        };
      }
      return {
        taskId: first.taskId,
        category: first.category,
        difficulty: first.difficulty,
        results,
      };
    },
  );

  const failureModes = [
    ...groupBy(
      attempts.filter((a) => !a.pass),
      (a) => `${cellKey(a)}\u0000${a.failureMode}`,
    ).values(),
  ]
    .map((items) => {
      const first = items[0] as AttemptRecord;
      return {
        interface: first.interface,
        model: first.model,
        failureMode: first.failureMode,
        count: items.length,
        exampleTasks: [...new Set(items.map((a) => a.taskId))].slice(0, 5),
      };
    })
    .sort((a, b) => b.count - a.count);

  const errorCounts = new Map<string, Summary["topErrors"][number]>();
  for (const attempt of attempts) {
    for (const sample of attempt.errorSamples) {
      const signature = errorSignature(sample.text);
      const key = [attempt.interface, sample.kind, sample.op, signature].join(
        "\u0000",
      );
      const entry = errorCounts.get(key) ?? {
        interface: attempt.interface,
        kind: sample.kind,
        op: sample.op,
        signature,
        count: 0,
      };
      entry.count++;
      errorCounts.set(key, entry);
    }
  }
  const topErrors = [...errorCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const toolUsage: Summary["toolUsage"] = {};
  for (const attempt of attempts) {
    const usage = toolUsage[attempt.interface] ?? {};
    toolUsage[attempt.interface] = usage;
    for (const [op, count] of Object.entries(attempt.opsUsed)) {
      usage[op] = (usage[op] ?? 0) + count;
    }
  }

  return { meta, cells, categories, tasks, failureModes, topErrors, toolUsage };
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const num = (value: number, digits = 1) => value.toFixed(digits);
const usd = (value: number) => `$${value.toFixed(4)}`;

function table(headers: string[], rows: (string | number)[][]): string {
  const cell = (value: string | number) => String(value).replace(/\|/g, "\\|");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

export function renderMarkdown(summary: Summary): string {
  const { meta } = summary;
  const lines: string[] = [];
  lines.push(`# Agent eval report: ${meta.runId}`, "");
  lines.push(
    `- Started ${meta.startedAt}, finished ${meta.finishedAt}`,
    `- Interfaces: ${meta.interfaces.join(", ")}`,
    `- Models: ${meta.models.join(", ")}`,
    `- Tasks: ${meta.taskCount} × ${meta.repetitions} repetition(s)`,
    `- Settings: \`${JSON.stringify(meta.settings)}\``,
    "",
  );
  if (meta.skipped.length > 0) {
    lines.push(
      `Skipped ${meta.skipped.length} interface/task pairs (interface lacks the task's mode): ${[
        ...new Set(meta.skipped.map((s) => `${s.interface}:${s.taskId}`)),
      ]
        .slice(0, 10)
        .join(", ")}${meta.skipped.length > 10 ? ", …" : ""}`,
      "",
    );
  }

  lines.push("## Pass rate and cost per interface × model", "");
  lines.push(
    table(
      [
        "interface",
        "model",
        "pass rate (mean ± sd over reps)",
        "passes",
        "tools visible",
        "turns",
        "tool calls",
        "discovery calls",
        "tool errors",
        "invalid args",
        "typesense errors",
        "unknown tool",
        "denied",
        "dup calls",
        "nonexistent-op calls",
        "alt-tool mixes",
        "input tok",
        "output tok",
        "cost/attempt",
        "total cost",
        "wall s",
      ],
      summary.cells.map((c) => [
        c.interface,
        c.model,
        `${pct(c.passRate)} ± ${pct(c.passRateStddev)}`,
        `${c.passes}/${c.attempts}`,
        num(c.mean.toolsAvailable, 0),
        num(c.mean.turns),
        num(c.mean.toolCalls),
        num(c.mean.discoveryCalls),
        num(c.mean.toolErrors, 2),
        num(c.mean.invalidArgErrors, 2),
        num(c.mean.typesenseErrors, 2),
        num(c.mean.unknownToolErrors, 2),
        num(c.mean.deniedCalls, 2),
        num(c.mean.duplicateCalls, 2),
        num(c.mean.unknownOpCalls, 2),
        num(c.mean.alternateToolMixes, 2),
        num(c.mean.inputTokens, 0),
        num(c.mean.outputTokens, 0),
        usd(c.mean.costUsd),
        usd(c.totalCostUsd),
        num(c.mean.wallSeconds),
      ]),
    ),
    "",
    "Per-attempt means except passes and total cost. Input tokens include cache reads and writes.",
    "",
  );

  lines.push("## Pass rate by category", "");
  const columns = summary.cells.map((c) => `${c.interface} · ${c.model}`);
  const byCategory = groupBy(summary.categories, (c) => c.category);
  lines.push(
    table(
      ["category", ...columns],
      [...byCategory.entries()].map(([category, rows]) => [
        category,
        ...summary.cells.map((cell) => {
          const row = rows.find(
            (r) => r.interface === cell.interface && r.model === cell.model,
          );
          return row
            ? `${pct(row.passRate)}${row.passRateStddev > 0 ? ` ± ${pct(row.passRateStddev)}` : ""} (n=${row.attempts})`
            : "–";
        }),
      ]),
    ),
    "",
  );

  lines.push("## Most common failure modes", "");
  lines.push(
    summary.failureModes.length === 0
      ? "No failures."
      : table(
          ["interface", "model", "failure mode", "count", "example tasks"],
          summary.failureModes
            .slice(0, 20)
            .map((f) => [
              f.interface,
              f.model,
              f.failureMode,
              f.count,
              f.exampleTasks.join(", "),
            ]),
        ),
    "",
  );

  lines.push("## Most common tool errors", "");
  lines.push(
    summary.topErrors.length === 0
      ? "No tool errors."
      : table(
          ["interface", "kind", "op", "count", "error (normalized)"],
          summary.topErrors.map((e) => [
            e.interface,
            e.kind,
            e.op,
            e.count,
            e.signature,
          ]),
        ),
    "",
  );

  lines.push("## Operations used", "");
  for (const [iface, usage] of Object.entries(summary.toolUsage)) {
    const top = Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([op, count]) => `\`${op}\` ${count}`)
      .join(", ");
    lines.push(`- **${iface}**: ${top || "none"}`);
  }
  lines.push("");

  lines.push("## Per-task results (passes/attempts)", "");
  lines.push(
    table(
      ["task", "category", "difficulty", ...columns],
      summary.tasks.map((t) => [
        t.taskId,
        t.category,
        t.difficulty,
        ...columns.map((column) => {
          const r = t.results[column];
          return r ? `${r.passes}/${r.attempts}` : "–";
        }),
      ]),
    ),
    "",
  );
  return lines.join("\n");
}
