import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { EffortLevel } from "@anthropic-ai/claude-agent-sdk";
import { tasks as allTasks, selectTasks } from "../tasks/index.js";
import type { AgentSettings } from "./agent.js";
import { AUTH_MODES, type AuthMode, resolveAuth } from "./auth.js";
import {
  type Cluster,
  DEFAULT_IMAGE,
  dockerAvailable,
  externalCluster,
  startCluster,
} from "./docker.js";
import { validateInterfaces, validateTasks } from "./dry-run.js";
import { loadCliOps } from "./inspect.js";
import {
  type InterfaceConfig,
  listInterfaces,
  missingRequirements,
  resolveInterfaces,
} from "./interfaces.js";
import { analyzeTranscript, type TranscriptMessage } from "./metrics.js";
import { EVALS_ROOT, REPO_ROOT } from "./paths.js";
import { buildSummary, type RunMeta, renderMarkdown } from "./report.js";
import { attemptMetrics, runAttempt } from "./runner.js";
import type { AttemptRecord, Task } from "./types.js";
import { TypesenseHttp } from "./typesense.js";

export const DEFAULT_MODELS = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
];

const HELP = `Usage: pnpm eval [options]

Runs the TypesenseKit agent benchmark. Costs API credits unless --dry-run,
--inspect, --list, or --report is used.

Selection
  -i, --interface <sel>   mcp | cli | both | all | comma-separated names (default: both)
  -m, --model <ids>       comma-separated model ids (default: ${DEFAULT_MODELS.join(",")})
  -t, --tasks <filter>    ids, id prefixes ("search." or "debug*"), categories,
                          difficulties, or modes; "!term" excludes (default: all)
  -r, --reps <n>          repetitions per task (default: 1)

Agent limits (per attempt)
      --max-turns <n>     default 25
      --max-budget <usd>  default 1.00
      --timeout <s>       default 300
      --effort <level>    low | medium | high | xhigh | max (default: model default)

Auth
      --auth <mode>       auto | api-key | oauth-token | auth-token | claude-login
                          auto (default) uses the first of ANTHROPIC_API_KEY,
                          CLAUDE_CODE_OAUTH_TOKEN (from \`claude setup-token\`), or
                          ANTHROPIC_AUTH_TOKEN, plus ANTHROPIC_BASE_URL if set.
                          claude-login reuses your Claude Code keychain login.

Cluster
  -c, --concurrency <n>   parallel workers, one Docker cluster each (default: 1)
      --image <image>     default ${DEFAULT_IMAGE}
      --typesense-url <u> use an existing cluster instead of Docker (it is WIPED)
      --typesense-api-key <k>
      --allow-wipe        required with --typesense-url

Modes
      --dry-run           validate tasks, graders, and interface wiring; no model calls
      --inspect           print tool-surface stats for each interface; no model calls
      --list              list tasks and interfaces
      --report <dir>      rebuild summary.{md,json} from <dir>/attempts.jsonl
      --reanalyze         with --report: recompute tool metrics from the saved
                          transcripts with the current metrics code
  -y, --yes               skip the confirmation for runs over 30 attempts
      --results <dir>     default evals/results
  -h, --help
`;

function parse() {
  const { values } = parseArgs({
    options: {
      interface: { type: "string", short: "i", default: "both" },
      model: { type: "string", short: "m" },
      tasks: { type: "string", short: "t" },
      reps: { type: "string", short: "r", default: "1" },
      "max-turns": { type: "string", default: "25" },
      "max-budget": { type: "string", default: "1" },
      timeout: { type: "string", default: "300" },
      effort: { type: "string" },
      auth: { type: "string", default: "auto" },
      concurrency: { type: "string", short: "c", default: "1" },
      image: { type: "string", default: DEFAULT_IMAGE },
      "typesense-url": { type: "string" },
      "typesense-api-key": { type: "string" },
      "allow-wipe": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      inspect: { type: "boolean", default: false },
      list: { type: "boolean", default: false },
      report: { type: "string" },
      reanalyze: { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      results: { type: "string", default: join(EVALS_ROOT, "results") },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });
  const positiveInt = (name: string, value: string | undefined) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1)
      throw new Error(`--${name} must be a positive integer`);
    return n;
  };
  const auth = values.auth as AuthMode;
  if (!AUTH_MODES.includes(auth)) {
    throw new Error(`--auth must be one of ${AUTH_MODES.join(", ")}`);
  }
  const effort = values.effort as EffortLevel | undefined;
  if (effort && !["low", "medium", "high", "xhigh", "max"].includes(effort)) {
    throw new Error(`--effort must be low, medium, high, xhigh, or max`);
  }
  return {
    ...values,
    auth,
    models: (values.model ?? DEFAULT_MODELS.join(","))
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    results: resolve(process.env.INIT_CWD ?? process.cwd(), values.results),
    reps: positiveInt("reps", values.reps),
    maxTurns: positiveInt("max-turns", values["max-turns"]),
    maxBudgetUsd: Number(values["max-budget"]),
    timeoutMs: positiveInt("timeout", values.timeout) * 1000,
    concurrency: positiveInt("concurrency", values.concurrency),
    effort,
  };
}

type Args = ReturnType<typeof parse>;

async function acquireClusters(args: Args, count: number): Promise<Cluster[]> {
  if (args["typesense-url"]) {
    if (!args["allow-wipe"] || !args["typesense-api-key"]) {
      throw new Error(
        "--typesense-url wipes every collection, alias, preset, synonym set, curation set, stopword set, analytics rule, and API key on that cluster. Pass --typesense-api-key and --allow-wipe to confirm.",
      );
    }
    return [externalCluster(args["typesense-url"], args["typesense-api-key"])];
  }
  const docker = await dockerAvailable();
  if (!docker) {
    throw new Error(
      "Docker is not available. Start Docker/OrbStack, or pass --typesense-url with --allow-wipe.",
    );
  }
  console.log(
    `Starting ${count} Typesense container(s) (${args.image}, Docker ${docker})...`,
  );
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      startCluster(args.image, `eval${i}`),
    ),
  );
}

function checkBuilt(configs: InterfaceConfig[]) {
  const missing = configs.flatMap((config) =>
    missingRequirements(config).map(
      (path) => `${config.name}: ${relative(REPO_ROOT, path)}`,
    ),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing build outputs (run \`pnpm build\` at the repo root):\n  ${missing.join("\n  ")}`,
    );
  }
}

function listCommand() {
  console.log("Interfaces:");
  for (const config of listInterfaces()) {
    console.log(
      `  ${config.name.padEnd(22)} ${config.kind.padEnd(4)} modes: ${Object.keys(config.modes).join(", ")}`,
    );
  }
  console.log(`\nTasks (${allTasks.length}):`);
  for (const task of allTasks) {
    console.log(
      `  ${task.id.padEnd(40)} ${task.category.padEnd(13)} ${task.difficulty.padEnd(7)} ${task.mode}`,
    );
  }
}

function writeReport(runDir: string, meta: RunMeta, attempts: AttemptRecord[]) {
  const summary = buildSummary(attempts, meta);
  writeFileSync(
    join(runDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  writeFileSync(join(runDir, "summary.md"), renderMarkdown(summary));
  return summary;
}

/** pnpm runs scripts from the package dir; resolve user paths from where pnpm was invoked. */
const userPath = (path: string) =>
  resolve(process.env.INIT_CWD ?? process.cwd(), path);

async function reportCommand(dir: string, reanalyze: boolean) {
  const runDir = userPath(dir);
  let attempts = readFileSync(join(runDir, "attempts.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as AttemptRecord);
  if (reanalyze) attempts = await reanalyzeAttempts(runDir, attempts);
  const metaPath = join(runDir, "meta.json");
  const meta = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, "utf8")) as RunMeta)
    : ({
        runId: runDir.split("/").pop() ?? "run",
        startedAt: attempts[0]?.startedAt ?? "",
        finishedAt: new Date().toISOString(),
        interfaces: [...new Set(attempts.map((a) => a.interface))],
        models: [...new Set(attempts.map((a) => a.model))],
        repetitions: Math.max(...attempts.map((a) => a.repetition)),
        taskCount: new Set(attempts.map((a) => a.taskId)).size,
        skipped: [],
        settings: {},
      } satisfies RunMeta);
  writeReport(runDir, meta, attempts);
  console.log(`Wrote ${join(runDir, "summary.md")}`);
}

/**
 * Recomputes tool-call metrics from transcripts with the current metrics
 * code, so runs recorded with older metric logic stay comparable. Writes
 * attempts.reanalyzed.jsonl and leaves attempts.jsonl untouched.
 */
async function reanalyzeAttempts(
  runDir: string,
  attempts: AttemptRecord[],
): Promise<AttemptRecord[]> {
  const configs = new Map(listInterfaces().map((c) => [c.name, c]));
  const offline = new TypesenseHttp("http://127.0.0.1:9", "unused");
  for (const config of configs.values()) {
    if (config.kind === "cli" && config.opsListCommand && !config.validOps) {
      config.validOps = await loadCliOps(config, offline);
    }
  }
  const updated = attempts.map((attempt) => {
    const config = configs.get(attempt.interface);
    if (!config || !existsSync(attempt.transcriptPath)) return attempt;
    const messages = readFileSync(attempt.transcriptPath, "utf8")
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TranscriptMessage)
      .filter((message) => !message.type.startsWith("eval_"));
    return {
      ...attempt,
      ...attemptMetrics(analyzeTranscript(messages, config)),
    };
  });
  writeFileSync(
    join(runDir, "attempts.reanalyzed.jsonl"),
    updated.map((a) => JSON.stringify(a)).join("\n") + "\n",
  );
  console.log(`Reanalyzed ${updated.length} attempts from transcripts.`);
  return updated;
}

async function dryRunCommand(
  args: Args,
  configs: InterfaceConfig[],
  tasks: Task[],
) {
  checkBuilt(configs);
  const [cluster] = await acquireClusters(args, 1);
  if (!cluster) throw new Error("no cluster");
  try {
    console.log(
      `\nValidating ${tasks.length} tasks against ${cluster.ts.url}...`,
    );
    const taskLines = await validateTasks(tasks, cluster.ts);
    for (const line of taskLines) {
      console.log(`${line.ok ? "ok  " : "FAIL"} ${line.label}: ${line.detail}`);
    }
    console.log(`\nValidating ${configs.length} interface(s)...`);
    const iface = await validateInterfaces(
      configs,
      cluster.ts,
      args.models[0] ?? (DEFAULT_MODELS[0] as string),
    );
    for (const line of iface.lines) {
      console.log(`${line.ok ? "ok  " : "FAIL"} ${line.label}: ${line.detail}`);
    }
    const all = [...taskLines, ...iface.lines];
    const failed = all.filter((line) => !line.ok);
    const runDir = join(args.results, `dry-run-${timestamp()}`);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, "dry-run.json"),
      `${JSON.stringify({ tasks: taskLines, interfaces: iface.lines, inspections: iface.inspections }, null, 2)}\n`,
    );
    console.log(
      `\nDry run: ${all.length - failed.length}/${all.length} checks passed. Details: ${relative(process.cwd(), runDir)}/dry-run.json`,
    );
    if (failed.length > 0) process.exitCode = 1;
  } finally {
    await cluster.stop();
  }
}

async function inspectCommand(args: Args, configs: InterfaceConfig[]) {
  checkBuilt(configs);
  const [cluster] = await acquireClusters(args, 1);
  if (!cluster) throw new Error("no cluster");
  try {
    const { inspections } = await validateInterfaces(
      configs,
      cluster.ts,
      args.models[0] ?? (DEFAULT_MODELS[0] as string),
    );
    console.log(JSON.stringify(inspections, null, 2));
  } finally {
    await cluster.stop();
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
}

async function runCommand(
  args: Args,
  configs: InterfaceConfig[],
  tasks: Task[],
) {
  const auth = resolveAuth(args.auth);
  console.log(`Auth: ${auth.description}`);
  checkBuilt(configs);

  type Job = {
    task: Task;
    config: InterfaceConfig;
    model: string;
    repetition: number;
  };
  const jobs: Job[] = [];
  const skipped: RunMeta["skipped"] = [];
  for (const config of configs) {
    for (const task of tasks) {
      if (!config.modes[task.mode]) {
        skipped.push({
          interface: config.name,
          taskId: task.id,
          reason: `no ${task.mode} mode`,
        });
      }
    }
  }
  for (let repetition = 1; repetition <= args.reps; repetition++) {
    for (const model of args.models) {
      for (const config of configs) {
        for (const task of tasks) {
          if (config.modes[task.mode])
            jobs.push({ task, config, model, repetition });
        }
      }
    }
  }
  if (jobs.length === 0) throw new Error("No attempts selected.");
  console.log(
    `Plan: ${jobs.length} attempts = ${tasks.length} tasks × ${configs.length} interface(s) × ${args.models.length} model(s) × ${args.reps} rep(s)${skipped.length ? ` (minus ${skipped.length} skipped pairs)` : ""}. Per-attempt cap $${args.maxBudgetUsd}, worst case $${(jobs.length * args.maxBudgetUsd).toFixed(2)}.`,
  );
  if (jobs.length > 30 && !args.yes) {
    throw new Error(
      "More than 30 attempts. Re-run with --yes to confirm the spend.",
    );
  }

  const runId = `run-${timestamp()}`;
  const runDir = join(args.results, runId);
  mkdirSync(join(runDir, "transcripts"), { recursive: true });
  const attemptsPath = join(runDir, "attempts.jsonl");
  const meta: RunMeta = {
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    interfaces: configs.map((c) => c.name),
    models: args.models,
    repetitions: args.reps,
    taskCount: tasks.length,
    skipped,
    settings: {
      maxTurns: args.maxTurns,
      maxBudgetUsd: args.maxBudgetUsd,
      timeoutMs: args.timeoutMs,
      effort: args.effort ?? "default",
      auth: auth.mode,
      tasks: args.tasks ?? "all",
    },
  };
  writeFileSync(
    join(runDir, "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );

  const clusters = await acquireClusters(
    args,
    Math.min(args.concurrency, jobs.length),
  );
  const [firstCluster] = clusters;
  for (const config of configs) {
    if (config.kind === "cli" && config.opsListCommand && !config.validOps) {
      if (!firstCluster) break;
      config.validOps = await loadCliOps(config, firstCluster.ts);
      console.log(
        `${config.name}: ${config.validOps.length} operations (used to spot calls to nonexistent ops)`,
      );
    }
  }
  const attempts: AttemptRecord[] = [];
  let next = 0;
  let done = 0;
  const worker = async (cluster: Cluster) => {
    while (next < jobs.length) {
      const job = jobs[next++] as Job;
      const settings: AgentSettings = {
        model: job.model,
        maxTurns: args.maxTurns,
        maxBudgetUsd: args.maxBudgetUsd,
        timeoutMs: args.timeoutMs,
        effort: args.effort,
        auth,
      };
      const transcriptPath = join(
        runDir,
        "transcripts",
        `${job.config.name}__${job.model}__${job.task.id}__r${job.repetition}.jsonl`,
      );
      let record: AttemptRecord;
      try {
        record = await runAttempt({
          runId,
          task: job.task,
          config: job.config,
          ts: cluster.ts,
          settings,
          repetition: job.repetition,
          transcriptPath,
        });
      } catch (error) {
        console.error(
          `harness error on ${job.config.name} ${job.model} ${job.task.id}: ${error instanceof Error ? error.stack : String(error)}`,
        );
        continue;
      }
      attempts.push(record);
      appendFileSync(attemptsPath, `${JSON.stringify(record)}\n`);
      done++;
      console.log(
        `[${done}/${jobs.length}] ${record.pass ? "PASS" : "FAIL"} ${record.interface} ${record.model} ${record.taskId} r${record.repetition} — ${record.toolCalls} calls, ${record.toolErrors} errors, ${record.turns} turns, $${record.costUsd.toFixed(4)}, ${(record.wallMs / 1000).toFixed(1)}s${record.pass ? "" : ` [${record.failureMode}] ${record.gradeDetail.slice(0, 160)}`}`,
      );
    }
  };
  try {
    await Promise.all(clusters.map(worker));
  } finally {
    await Promise.all(clusters.map((cluster) => cluster.stop()));
  }

  meta.finishedAt = new Date().toISOString();
  writeFileSync(
    join(runDir, "meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
  const summary = writeReport(runDir, meta, attempts);
  console.log("");
  for (const cell of summary.cells) {
    console.log(
      `${cell.interface.padEnd(20)} ${cell.model.padEnd(20)} pass ${(cell.passRate * 100).toFixed(1)}% ± ${(cell.passRateStddev * 100).toFixed(1)}% (${cell.passes}/${cell.attempts}), $${cell.totalCostUsd.toFixed(4)} total`,
    );
  }
  console.log(
    `\nReport: ${relative(process.cwd(), join(runDir, "summary.md"))}`,
  );
}

async function main() {
  const args = parse();
  if (args.help) {
    console.log(HELP);
    return;
  }
  if (args.list) return listCommand();
  if (args.report) return reportCommand(args.report, args.reanalyze);
  const configs = resolveInterfaces(args.interface);
  const tasks = selectTasks(args.tasks);
  if (tasks.length === 0) throw new Error(`No tasks match "${args.tasks}"`);
  if (args.inspect) return inspectCommand(args, configs);
  if (args["dry-run"]) return dryRunCommand(args, configs, tasks);
  return runCommand(args, configs, tasks);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
