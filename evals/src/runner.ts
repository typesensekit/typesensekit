import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  SDKMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { type AgentSettings, startAgent } from "./agent.js";
import { extractFinalAnswer, type Grade, gradeAnswer } from "./answer.js";
import type { InterfaceConfig } from "./interfaces.js";
import { analyzeTranscript, type TranscriptMessage } from "./metrics.js";
import { resetAndSeed } from "./seed.js";
import type { AnswerSpec, AttemptRecord, FailureMode, Task } from "./types.js";
import type { TypesenseHttp } from "./typesense.js";

export async function resolveExpected(
  task: Task & { kind: "answer" },
  ts: TypesenseHttp,
): Promise<AnswerSpec> {
  return typeof task.expected === "function"
    ? task.expected(ts)
    : task.expected;
}

export async function runAttempt(params: {
  runId: string;
  task: Task;
  config: InterfaceConfig;
  ts: TypesenseHttp;
  settings: AgentSettings;
  repetition: number;
  transcriptPath: string;
}): Promise<AttemptRecord> {
  const { task, config, ts, settings } = params;
  const startedAt = new Date();
  await resetAndSeed(ts);
  // Oracles run on the fresh seed, before the agent can touch anything.
  const expected =
    task.kind === "answer" ? await resolveExpected(task, ts) : undefined;

  mkdirSync(dirname(params.transcriptPath), { recursive: true });
  const transcript = createWriteStream(params.transcriptPath);
  const write = (value: unknown) =>
    transcript.write(`${JSON.stringify(value)}\n`);
  write({
    type: "eval_meta",
    runId: params.runId,
    interface: config.name,
    model: settings.model,
    taskId: task.id,
    mode: task.mode,
    repetition: params.repetition,
    prompt: task.prompt,
    startedAt: startedAt.toISOString(),
  });

  const session = startAgent({
    prompt: task.prompt,
    config,
    mode: task.mode,
    ts,
    settings,
  });
  const messages: SDKMessage[] = [];
  let result: SDKResultMessage | undefined;
  let toolsAvailable = 0;
  let timedOut = false;
  let agentError: string | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    session.abort();
  }, settings.timeoutMs);
  const started = Date.now();
  try {
    for await (const message of session.messages) {
      messages.push(message);
      write(message);
      if (message.type === "system" && message.subtype === "init") {
        toolsAvailable = message.tools.length;
      }
      if (message.type === "result") result = message;
    }
  } catch (error) {
    agentError = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }
  const wallMs = Date.now() - started;
  if (session.stderr.length > 0) {
    write({ type: "eval_stderr", text: session.stderr.join("").slice(-4000) });
  }
  session.cleanup();

  const finalText = result?.subtype === "success" ? result.result : undefined;
  const finalAnswer = extractFinalAnswer(finalText);
  let grade: Grade;
  if (task.kind === "answer") {
    grade = gradeAnswer(finalAnswer, expected as AnswerSpec);
  } else {
    try {
      grade = await task.check(ts);
    } catch (error) {
      grade = {
        pass: false,
        detail: `state check threw: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  let failureMode: FailureMode;
  if (grade.pass) failureMode = "passed";
  else if (timedOut) failureMode = "timeout";
  else if (result?.subtype === "error_max_turns") failureMode = "max_turns";
  else if (result?.subtype === "error_max_budget_usd")
    failureMode = "budget_exceeded";
  else if (!result || result.is_error || agentError)
    failureMode = "agent_error";
  else if (task.kind === "state") failureMode = "state_not_reached";
  else if (finalAnswer === null) failureMode = "no_final_answer";
  else failureMode = "wrong_answer";

  const detail = [
    grade.detail,
    agentError ? `agent error: ${agentError}` : "",
    result && result.subtype !== "success"
      ? `result ${result.subtype}: ${result.errors.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
  write({
    type: "eval_grade",
    pass: grade.pass,
    failureMode,
    detail,
    finalAnswer,
  });
  await new Promise((resolve) => transcript.end(resolve));

  const analysis = analyzeTranscript(
    messages as unknown as TranscriptMessage[],
    config,
  );
  const usage = result?.usage;
  const toolErrors = analysis.calls.filter((call) => call.isError).length;
  return {
    runId: params.runId,
    interface: config.name,
    model: settings.model,
    taskId: task.id,
    category: task.category,
    difficulty: task.difficulty,
    mode: task.mode,
    repetition: params.repetition,
    pass: grade.pass,
    failureMode,
    gradeDetail: detail,
    finalAnswer,
    turns:
      result?.num_turns ??
      messages.filter((m) => m.type === "assistant").length,
    toolsAvailable,
    toolCalls: analysis.calls.length,
    discoveryCalls: analysis.calls.filter((call) => call.discovery).length,
    toolErrors,
    errorsByKind: analysis.errorsByKind,
    duplicateCalls: analysis.duplicateCalls,
    unknownOpCalls: analysis.unknownOpCalls,
    alternateToolMixes: analysis.alternateToolMixes,
    opsUsed: analysis.opsUsed,
    errorSamples: analysis.calls
      .filter((call) => call.isError)
      .slice(0, 8)
      .map((call) => ({
        op:
          call.ops[0] ??
          (call.unknownOps[0]
            ? `${call.unknownOps[0]} (nonexistent)`
            : call.tool),
        kind: call.errorKind ?? "other",
        // Skip the Bash "Exit code N" header so the sample shows the message.
        text:
          call.resultPreview
            .split("\n")
            .find((line) => line.trim() && !/^Exit code \d+\s*$/.test(line))
            ?.slice(0, 200) ?? "",
      })),
    inputTokens: usage?.input_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    costUsd: result?.total_cost_usd ?? 0,
    wallMs,
    transcriptPath: params.transcriptPath,
    startedAt: startedAt.toISOString(),
  };
}
