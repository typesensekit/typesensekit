import {
  operationDescription,
  operations,
  redactSecrets,
} from "@typesensekit/core";
import { type CommandDef, runCommand, runMain } from "citty";
import { clusterOverview } from "./cluster-overview.js";
import {
  inputObjectSchema,
  type JsonSchemaLike,
  renderOperationExamples,
} from "./operation-docs.js";
import { operationSpecificArgs, positionalKeys } from "./operations.js";
import { QUICK_START } from "./quick-start.js";

export { QUICK_START };

const names = new Set(operations.map((operation) => operation.name));
const BUILTIN_COMMANDS = ["operations", "profile", "skills", "completion"];

/** Resolve space-separated operation paths without changing flag values. */
const groups = new Set(
  operations.map((operation) => operation.name.split(".")[0] ?? ""),
);

export function normalizeCommand(argv: string[]): string[] {
  // Singular group names resolve to their group: `tsk key create` = keys.create.
  const [first] = argv;
  const plural = [`${first}s`, `${first}es`].find((name) => groups.has(name));
  if (
    first &&
    plural &&
    !first.startsWith("-") &&
    !groups.has(first) &&
    !names.has(first) &&
    !BUILTIN_COMMANDS.includes(first)
  )
    argv = [plural, ...argv.slice(1)];
  let best = 0;
  for (let size = 1; size <= argv.length; size++) {
    if (argv[size - 1]?.startsWith("-")) break;
    if (names.has(argv.slice(0, size).join("."))) best = size;
  }
  if (!best) return argv;
  return [argv.slice(0, best).join("."), ...argv.slice(best)];
}

function describeProperty(
  key: string,
  value: JsonSchemaLike,
  required: boolean,
  positional: boolean,
): string {
  const type = Array.isArray(value.type)
    ? value.type.join("|")
    : (value.type ??
      (value.anyOf
        ?.map((entry) => entry.type)
        .filter(Boolean)
        .join("|") ||
        "value"));
  const tags = [
    type,
    required ? "required" : "",
    positional ? "positional" : "",
  ].filter(Boolean);
  return `  ${key} (${tags.join(", ")})${value.description ? `: ${value.description}` : ""}`;
}

export function operationHelp(name: string): string {
  const operation = operations.find((entry) => entry.name === name);
  if (!operation) throw new Error(`Unknown operation: ${name}`);
  const schema = inputObjectSchema(operation.input);
  const properties = Object.entries(schema.properties ?? {});
  const positional = positionalKeys(name);
  const command = name.replaceAll(".", " ");
  const isSearch = name === "search" || name === "documents.search";
  const description = operationDescription(operation);
  const lines = [
    `${name}: ${operation.summary}`,
    ...(description !== operation.summary ? [description] : []),
    `Usage: tsk ${command}${positional.map((key) => ` <${key}>`).join("")}${
      isSearch
        ? " [--<search param> value ...] [--compact] [--json]"
        : properties.some(([key]) => !positional.includes(key))
          ? " [--<field> value ...] [--json]"
          : " [--json]"
    }`,
    `   or: tsk ${name} --input '<JSON or file path>' --json`,
    "Inputs:",
    ...(properties.length
      ? properties.map(([key, value]) =>
          describeProperty(
            key,
            value,
            schema.required?.includes(key) ?? false,
            positional.includes(key),
          ),
        )
      : ["  (none)"]),
  ];
  if (isSearch) {
    const params = Object.entries(
      schema.properties?.params?.properties ?? {},
    ).map(
      ([key, value]) =>
        `  --${key.replaceAll("_", "-")}: ${value.description ?? ""}`,
    );
    lines.push(
      "Search params (as flags, or inside params in --input JSON; any other Typesense param also works):",
      ...params,
      "Examples:",
      `tsk ${command} products --filter-by 'category:=Audio && price:<100' --per-page 0 --json   (count: read found)`,
      `tsk ${command} products --facet-by brand --max-facet-values 250 --per-page 0 --compact --json`,
      `tsk ${command} products --q chair --query-by name,description --sort-by price:asc --per-page 3 --include-fields id,name,price --compact --json`,
    );
  } else {
    lines.push("Examples:");
  }
  lines.push(
    renderOperationExamples(name, operation.input),
    "Flags: --schema (full input schema), --examples, --json, --yes (confirm destructive), --profile NAME, --config PATH, --debug",
    ...Object.entries(operationSpecificArgs(name)).map(
      ([flag, definition]) => `--${flag}: ${definition.description ?? ""}`,
    ),
  );
  if (name === "collections.list" || name === "collections.retrieve")
    lines.push(
      "--compact: short overview with doc counts, aliases, and fields with type and facet/sort flags (one-line JSON with --json).",
    );
  if (name === "documents.export")
    lines.push(
      "--format jsonl prints one document per line; --format array prints a JSON array. Default/--json output is a JSON string containing JSONL. Extra flags such as --filter-by and --include-fields become export params.",
    );
  return lines.join("\n");
}

export function groupHelp(prefix = "", overview?: string): string {
  const matches = operations.filter(
    (operation) => !prefix || operation.name.startsWith(`${prefix}.`),
  );
  if (prefix)
    return [
      `${prefix} operations (dotted and space-separated commands both work):`,
      ...(prefix === "collections"
        ? [
            "  Start here: tsk collections list --compact (doc counts, aliases, field flags)",
          ]
        : []),
      ...matches.map(
        (operation) => `  ${operation.name}\t${operation.summary}`,
      ),
      "Use tsk <operation> --help for inputs, flags and examples.",
    ].join("\n");
  return [
    QUICK_START,
    ...(overview ? [overview] : []),
    `# Groups: ${[...new Set(operations.map((operation) => operation.name.split(".")[0]))].join(", ")}`,
    "# Other commands: tsk operations (list all operations), profile, skills, completion.",
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
      console.log(groupHelp("", await clusterOverview()));
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
