import { operations, redactSecrets } from "@typesensekit/core";
import { type CommandDef, runCommand, runMain } from "citty";
import {
  inputObjectSchema,
  renderOperationExamples,
} from "./operation-docs.js";

import { operationSpecificArgs } from "./operations.js";

const names = new Set(operations.map((operation) => operation.name));
const BUILTIN_COMMANDS = ["operations", "profile", "skills", "completion"];

/** Resolve space-separated operation paths without changing flag values. */
export function normalizeCommand(argv: string[]): string[] {
  let best = 0;
  for (let size = 1; size <= argv.length; size++) {
    if (argv[size - 1]?.startsWith("-")) break;
    if (names.has(argv.slice(0, size).join("."))) best = size;
  }
  if (!best) return argv;
  return [argv.slice(0, best).join("."), ...argv.slice(best)];
}

export function operationHelp(name: string): string {
  const operation = operations.find((entry) => entry.name === name);
  if (!operation) throw new Error(`Unknown operation: ${name}`);
  const schema = inputObjectSchema(operation.input);
  return [
    `${name}: ${operation.summary}`,
    `Usage: tsk ${name} --input '<JSON or file path>' --json`,
    `Input: ${
      Object.entries(schema.properties ?? {})
        .map(
          ([key, value]) =>
            `${key}${schema.required?.includes(key) ? " (required)" : ""}: ${value.type ?? "value"}`,
        )
        .join(", ") || "{}"
    }`,
    renderOperationExamples(name, operation.input),
    "Flags: --schema (full input schema), --examples, --json, --profile NAME, --config PATH, --yes, --debug",
    ...Object.entries(operationSpecificArgs(name)).map(
      ([flag, definition]) => `--${flag}: ${definition.description ?? ""}`,
    ),
    ...(name === "documents.export"
      ? [
          "Export output is a JSON string containing JSONL. Use --format jsonl for raw lines or --format array for a JSON array; default/--json stays unchanged.",
        ]
      : []),
    ...(name === "search" || name === "documents.search"
      ? [
          "Put Typesense search options inside params: q, query_by, filter_by, sort_by, facet_by, per_page, page. Search returns 10 hits/page and 10 facet values by default; set per_page and max_facet_values as needed.",
        ]
      : []),
  ].join("\n");
}

export function groupHelp(prefix = ""): string {
  const matches = operations.filter(
    (operation) => !prefix || operation.name.startsWith(`${prefix}.`),
  );
  if (prefix)
    return [
      `${prefix} operations (dotted and space-separated commands both work):`,
      ...matches.map(
        (operation) => `  ${operation.name}\t${operation.summary}`,
      ),
      "Use tsk <operation> --help for input fields and an example.",
    ].join("\n");
  return [
    "tsk — Typesense CLI",
    "Usage: tsk <operation> --input '<JSON or file path>' --json",
    "Example: tsk collections.list --json",
    'Example: tsk collections.retrieve --input \'{"collection":"products"}\' --json',
    "Dotted and grouped commands both work: tsk collections list --json",
    `Groups: ${[...new Set(operations.map((operation) => operation.name.split(".")[0]))].join(", ")}`,
    "Discovery: tsk operations | tsk <group> --help | tsk <operation> --help",
    "Details: tsk <operation> --schema or --examples",
    "Other commands: profile, skills, completion. Use --help on each.",
  ].join("\n");
}

export function suggestCommand(name: string): string | undefined {
  const candidates = [
    ...names,
    ...new Set(
      operations.map((operation) => operation.name.split(".")[0] ?? ""),
    ),
  ];
  const distance = (candidate: string) => {
    let row = Array.from({ length: candidate.length + 1 }, (_, index) => index);
    for (let i = 1; i <= name.length; i++) {
      const next = [i];
      for (let j = 1; j <= candidate.length; j++) {
        next[j] = Math.min(
          (next[j - 1] ?? 0) + 1,
          (row[j] ?? 0) + 1,
          (row[j - 1] ?? 0) + (name[i - 1] === candidate[j - 1] ? 0 : 1),
        );
      }
      row = next;
    }
    return row[candidate.length] ?? Infinity;
  };
  const ranked = candidates
    .map((candidate) => ({ candidate, distance: distance(candidate) }))
    .sort((a, b) => a.distance - b.distance);
  return ranked[0] && ranked[0].distance <= 2 ? ranked[0].candidate : undefined;
}

export async function dispatch(
  main: CommandDef,
  argv: string[],
  version: string,
) {
  const rawArgs = normalizeCommand(argv);
  const name = rawArgs[0] ?? "";
  try {
    if (!name || name === "--help" || name === "-h") {
      console.log(groupHelp());
      return;
    }
    if (name === "--version" || name === "-v") {
      console.log(version);
      return;
    }
    const builtin = BUILTIN_COMMANDS.includes(name);
    if (names.has(name)) {
      if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
        console.log(operationHelp(name));
        return;
      }
    } else if (
      // Built-ins win over same-named operation groups: `tsk operations`
      // lists every operation, not just the operations.* group.
      !builtin &&
      operations.some((operation) => operation.name.startsWith(`${name}.`))
    ) {
      if (
        rawArgs.length > 1 &&
        !rawArgs
          .slice(1)
          .every((arg) => ["--help", "-h", "--examples"].includes(arg))
      ) {
        throw new Error(
          `Unknown command: ${rawArgs.join(" ")}. Use tsk ${name} --help.`,
        );
      }
      console.log(groupHelp(name));
      return;
    } else if (!builtin) {
      const suggestion = suggestCommand(name);
      throw new Error(
        `Unknown command: ${name}.${suggestion ? ` Did you mean tsk ${suggestion}?` : ""} Use tsk operations or tsk --help.`,
      );
    } else if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
      await runMain(main, { rawArgs });
      return;
    }
    await runCommand(main, { rawArgs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${String(redactSecrets(message))}`);
    if (rawArgs.includes("--debug") && error instanceof Error)
      console.error(redactSecrets(error.stack));
    process.exitCode = 1;
  }
}
