import {
  formatTypesenseErrorMessage,
  getTypesenseErrorHint,
  operations,
} from "@typesensekit/core";
import { type ArgsDef, defineCommand } from "citty";
import { ZodError } from "zod";
import {
  coerceFlagValue,
  hoistParams,
  normalizeKey,
  PARAMS_OPERATIONS,
  parseArgv,
  SEARCH_OPERATIONS,
  snakeCase,
  unknownKeyHint,
} from "./cli-input.js";
import {
  aliasesByCollection,
  fieldsHint,
  renderCollectionsCompact,
} from "./collection-summary.js";
import { confirmDestructiveOperation } from "./confirmation.js";
import {
  inputObjectSchema,
  renderInputSchema,
  renderOperationExamples,
} from "./operation-docs.js";
import { parseInput, render, renderDense } from "./output.js";
import { resolveClient } from "./profile/resolve.js";
import { QUICK_START } from "./quick-start.js";

function definedEntries(args: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(args).filter(([, value]) => value !== undefined),
  );
}

function lifecycleArgs() {
  return {
    collection: { type: "string", description: "Collection name" },
    field: { type: "string", description: "Field name" },
    type: { type: "string", description: "Typesense field type" },
    optional: { type: "boolean", description: "Mark the field optional" },
    numDim: { type: "string", description: "Vector dimension count" },
    vecDist: { type: "string", description: "Vector distance metric" },
    hnswM: { type: "string", description: "HNSW M parameter" },
    hnswEfConstruction: {
      type: "string",
      description: "HNSW ef_construction parameter",
    },
    embedFrom: {
      type: "string",
      description: "Source field for embedding generation",
    },
    embedModel: {
      type: "string",
      description: "Embedding model name",
    },
    embedApiKey: {
      type: "string",
      description: "Embedding provider API key",
    },
    yes: {
      type: "boolean",
      description: "Confirm destructive schema changes without prompting",
    },
    timeoutMs: { type: "string", description: "Wait timeout in milliseconds" },
    intervalMs: {
      type: "string",
      description: "Wait interval in milliseconds",
    },
  } as const;
}

function waitArgs() {
  return {
    collection: { type: "string", description: "Collection name" },
    fieldPresent: { type: "string", description: "Wait for field to exist" },
    fieldMissing: {
      type: "string",
      description: "Wait for field to be absent",
    },
    fieldEmbedFrom: {
      type: "string",
      description: "Wait for FIELD:SOURCE embedding config",
    },
    timeoutMs: { type: "string", description: "Wait timeout in milliseconds" },
    intervalMs: {
      type: "string",
      description: "Wait interval in milliseconds",
    },
  } as const;
}

export function operationSpecificArgs(operationName: string): ArgsDef {
  if (operationName === "keys.create")
    return {
      reveal: {
        type: "boolean",
        description:
          "Include the newly created API key in output; store it securely",
      },
    } as const;
  if (operationName === "collections.wait") return waitArgs();
  if (operationName.startsWith("collections.fields.")) return lifecycleArgs();
  return {};
}

function operationSpecificInput(
  operationName: string,
  args: Record<string, unknown>,
) {
  const keys = new Set(Object.keys(operationSpecificArgs(operationName)));
  return definedEntries(
    Object.fromEntries(Object.entries(args).filter(([key]) => keys.has(key))),
  );
}

const COMPACT_COLLECTION_OPERATIONS = new Set([
  "collections.list",
  "collections.retrieve",
]);

function hasInputCompact(operationName: string): boolean {
  const operation = operations.find((entry) => entry.name === operationName);
  return Boolean(
    operation &&
      inputObjectSchema(operation.input).properties?.compact !== undefined,
  );
}

/** Flags every operation command accepts (citty definitions). */
function baseArgs(operationName: string): ArgsDef {
  return {
    ...(operationName === "documents.export"
      ? {
          format: {
            type: "string" as const,
            description:
              "jsonl | array (default: JSON string; --json unchanged)",
          },
        }
      : {}),
    ...(COMPACT_COLLECTION_OPERATIONS.has(operationName)
      ? {
          compact: {
            type: "boolean" as const,
            description:
              "Short overview: doc counts, aliases, and fields with type and facet/sort flags (JSON with --json)",
          },
        }
      : hasInputCompact(operationName)
        ? {}
        : {
            compact: {
              type: "boolean" as const,
              description:
                "Dense output without --json: valid JSON with one list entry per line",
            },
          }),
    input: {
      type: "string",
      description: "JSON object matching this operation input schema",
    },
    schema: {
      type: "boolean",
      description: "Print this operation input schema",
    },
    examples: {
      type: "boolean",
      description: "Print example invocations for this operation",
    },
    profile: { type: "string", description: "Profile name" },
    config: { type: "string", description: "Profile config path" },
    json: { type: "boolean", description: "Print JSON" },
    yes: {
      type: "boolean",
      description: "Confirm a destructive operation without prompting",
    },
    debug: {
      type: "boolean",
      description: "Include redacted diagnostic details in errors",
    },
    ...operationSpecificArgs(operationName),
  };
}

/** JSON numbers, booleans, null, arrays and objects; anything else stays a string. */
function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Required string inputs (including string/number IDs), in schema order. */
export function positionalKeys(operationName: string): string[] {
  const operation = operations.find((entry) => entry.name === operationName);
  if (!operation) return [];
  const schema = inputObjectSchema(operation.input);
  return Object.entries(schema.properties ?? {})
    .filter(
      ([key, value]) =>
        (value.type === "string" ||
          (Array.isArray(value.type) &&
            value.type.includes("string") &&
            value.type.every(
              (type) => type === "string" || type === "number",
            ))) &&
        schema.required?.includes(key) &&
        !(key in operationSpecificArgs(operationName)),
    )
    .map(([key]) => key);
}

/**
 * Builds operation input from positionals, `--input` JSON and `--<field>`
 * flags. Flags named after a top-level input field set that field; for search
 * and export, other flags become Typesense parameters (`--filter-by x` sets
 * params.filter_by).
 */
export function buildOperationInput(
  operationName: string,
  rawArgs: string[],
  args: Record<string, unknown>,
): Record<string, unknown> {
  const operation = operations.find((entry) => entry.name === operationName);
  if (!operation) throw new Error(`Unknown operation: ${operationName}`);
  const schema = inputObjectSchema(operation.input);
  const properties = schema.properties ?? {};
  const cliArgs = baseArgs(operationName);
  const cliFlag = new Map(
    Object.entries(cliArgs).map(([key, value]) => [normalizeKey(key), value]),
  );
  const cliFlagName = new Map(
    Object.keys(cliArgs).map((key) => [normalizeKey(key), key]),
  );
  const property = new Map(
    Object.keys(properties).map((key) => [normalizeKey(key), key]),
  );
  const parsed = parseArgv(rawArgs, (key) => {
    const normalized = normalizeKey(key);
    const definition = cliFlag.get(normalized);
    if (definition) return definition.type === "boolean";
    const name = property.get(normalized);
    return name !== undefined && properties[name]?.type === "boolean";
  });

  const keys = positionalKeys(operationName);
  if (parsed.positionals.length > keys.length) {
    // Earlier versions silently ignored extra arguments, so warn instead of
    // failing to keep existing scripts working.
    const extra = parsed.positionals.slice(keys.length);
    warn(
      `Ignoring unexpected argument${extra.length > 1 ? "s" : ""} for ${operationName}: ${extra.join(" ")}. ${
        keys.length
          ? `Positional arguments: ${keys.join(", ")}.`
          : "This operation takes no positional arguments."
      } Quote values that contain spaces.`,
    );
  }
  const positional = Object.fromEntries(
    parsed.positionals
      .slice(0, keys.length)
      .map((value, index) => [keys[index], value]),
  );

  const fromFlags: Record<string, unknown> = {};
  const params: Record<string, unknown> = {};
  let paramsFlag: Record<string, unknown> = {};
  const documentFields: Record<string, unknown> = {};
  for (const { key, value } of parsed.flags) {
    const normalized = normalizeKey(key);
    if (cliFlag.has(normalized)) {
      // citty parsed the CLI's own flags, but reads `--yes false` as
      // `--yes` plus a stray "false". Apply explicit boolean values here so
      // `--yes false` never confirms a destructive operation.
      const flagName = cliFlagName.get(normalized);
      if (
        flagName &&
        cliFlag.get(normalized)?.type === "boolean" &&
        typeof value === "string" &&
        /^(?:true|false)$/i.test(value)
      ) {
        args[flagName] = value.toLowerCase() === "true";
      }
      continue;
    }
    const name = property.get(normalized);
    if (name === "params") {
      // `--params '{"q":"x"}'` is the whole params object; individual
      // `--<param>` flags are merged over it.
      const parsedParams =
        typeof value === "string" ? parseJsonValue(value) : undefined;
      if (
        !parsedParams ||
        typeof parsedParams !== "object" ||
        Array.isArray(parsedParams)
      ) {
        throw new Error("--params must be a JSON object");
      }
      paramsFlag = parsedParams as Record<string, unknown>;
    } else if (name !== undefined) {
      fromFlags[name] = coerceFlagValue(value, properties[name]);
    } else if (PARAMS_OPERATIONS.has(operationName)) {
      params[snakeCase(key)] = value === true ? true : value;
    } else if (properties.document?.type === "object") {
      // `tsk documents update products p1 --price 9.99` sets document fields.
      documentFields[key] = value === true ? true : parseJsonValue(value);
    } else if (normalized !== "help" && normalized !== "h") {
      const options = [
        ...Object.keys(properties).map((entry) => `--${entry}`),
        ...Object.keys(cliArgs).map((entry) => `--${entry}`),
      ];
      // Earlier versions silently ignored unknown flags: warn, don't fail.
      warn(
        `Ignoring unknown option --${key} for ${operationName}. Options: ${[...new Set(options)].join(", ")}.`,
      );
    }
  }

  const json = parseInput(args.input as string | undefined);
  if (operationName === "documents.export" && "format" in json) {
    args.format ??= json.format;
    delete json.format;
  }
  let input: Record<string, unknown> = {
    ...positional,
    ...json,
    ...fromFlags,
  };
  if (Object.keys(params).length || Object.keys(paramsFlag).length) {
    // Precedence: --input params < --params < individual --<param> flags.
    const existing = input.params;
    input.params = {
      ...(typeof existing === "object" && existing !== null ? existing : {}),
      ...paramsFlag,
      ...params,
    };
  }
  if (Object.keys(documentFields).length) {
    const existing = input.document;
    input.document = {
      ...(typeof existing === "object" && existing !== null ? existing : {}),
      ...documentFields,
    };
  }
  input = hoistParams(operationName, input, Object.keys(properties));
  return {
    ...input,
    ...operationSpecificInput(operationName, args),
  };
}

async function compactCollections(
  client: Awaited<ReturnType<typeof resolveClient>>,
  result: unknown,
  json: boolean,
): Promise<string> {
  let aliases = new Map<string, string[]>();
  try {
    aliases = aliasesByCollection(await client.apiCall.get("/aliases"));
  } catch {
    // Keys without alias access still get the collection overview.
  }
  return renderCollectionsCompact(result, aliases, json);
}

/** Adds the collection's field list to errors about unknown or missing fields. */
async function fieldErrorHint(
  client: Awaited<ReturnType<typeof resolveClient>>,
  error: unknown,
  input: Record<string, unknown>,
): Promise<string | undefined> {
  const message = error instanceof Error ? error.message : String(error);
  if (
    typeof input.collection !== "string" ||
    !/could not find a (?:\w+ )?field named|no search fields specified|not a (?:facet|sortable)|field .* (?:is not|isn't) (?:a )?(?:facet|sortable|indexed)/i.test(
      message,
    )
  )
    return undefined;
  try {
    const collection = await client.apiCall.get(
      `/collections/${encodeURIComponent(input.collection)}`,
    );
    return fieldsHint(collection as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

export function operationCommands() {
  return Object.fromEntries(
    operations.map((operation) => [
      operation.name,
      defineCommand({
        meta: { name: operation.name, description: operation.summary },
        // Citty resolves args only for the selected command. Avoid converting
        // all operation schemas to JSON Schema on every process startup.
        args: () => ({
          ...Object.fromEntries(
            positionalKeys(operation.name).map((key) => [
              key,
              {
                type: "positional" as const,
                required: false,
                description: `Input ${key} (or use --input)`,
              },
            ]),
          ),
          ...baseArgs(operation.name),
        }),
        async run({ args, rawArgs }) {
          if (args.schema) {
            console.log(renderInputSchema(operation.input));
            return;
          }
          if (args.examples) {
            console.log(
              renderOperationExamples(operation.name, operation.input),
            );
            return;
          }

          let input: Record<string, unknown>;
          let raw: Record<string, unknown> = {};
          try {
            raw = buildOperationInput(
              operation.name,
              rawArgs,
              args as Record<string, unknown>,
            );
            input = operation.input.parse(raw);
          } catch (error) {
            const detail =
              error instanceof ZodError
                ? error.issues
                    .map(
                      (issue) =>
                        `${issue.path.join(".") || "input"}: ${issue.message}`,
                    )
                    .join("; ")
                : error instanceof Error
                  ? error.message
                  : String(error);
            const unknownKeys = unknownKeyHint(
              raw,
              Object.keys(inputObjectSchema(operation.input).properties ?? {}),
            );
            throw new Error(
              [
                `Invalid input for ${operation.name}: ${detail}`,
                ...(unknownKeys ? [unknownKeys] : []),
                renderOperationExamples(operation.name, operation.input),
                `Use tsk ${operation.name} --help for fields and flags.`,
              ].join("\n"),
            );
          }
          if (
            args.format !== undefined &&
            !["jsonl", "array"].includes(String(args.format))
          ) {
            throw new Error("--format must be jsonl or array");
          }
          await confirmDestructiveOperation(
            operation.name,
            input,
            args.yes === true || raw.yes === true,
          );
          const client = await resolveClient({
            profile: args.profile,
            config: args.config,
          });
          try {
            const result = await operation.execute(client, input);
            if (
              COMPACT_COLLECTION_OPERATIONS.has(operation.name) &&
              args.compact
            ) {
              console.log(
                await compactCollections(client, result, args.json === true),
              );
              return;
            }
            if (operation.name === "documents.export" && args.format) {
              if (typeof result !== "string")
                throw new Error("Expected JSONL export");
              const documents = result
                .split("\n")
                .filter((line) => line.trim())
                .map((line) => JSON.parse(line));
              console.log(
                args.format === "array"
                  ? render(documents, true)
                  : documents
                      .map((document) =>
                        JSON.stringify(JSON.parse(render(document, true))),
                      )
                      .join("\n"),
              );
              return;
            }
            if (
              !args.json &&
              (args.compact === true ||
                input.compact === true ||
                (SEARCH_OPERATIONS.has(operation.name) &&
                  (input.params as Record<string, unknown>)?.compact === true))
            ) {
              console.log(renderDense(result));
              return;
            }
            console.log(
              render(
                result,
                args.json,
                operation.name === "keys.create" && args.reveal === true,
              ),
            );
          } catch (error) {
            const hint =
              getTypesenseErrorHint(error, input) ??
              (await fieldErrorHint(client, error, input));
            const message = formatTypesenseErrorMessage(error, {
              debug: args.debug,
            });
            throw new Error(hint ? `${message}\n\n${hint}` : message);
          }
        },
      }),
    ]),
  );
}

/** `name<TAB>summary` per operation: the stable stdout of `tsk operations`. */
export function listOperations(): string {
  return operations
    .map((operation) => `${operation.name}\t${operation.summary}`)
    .join("\n");
}

/**
 * Quick start and live cluster overview printed by `tsk operations` on
 * stderr, so stdout stays the stable operation list that scripts parse
 * while people and agents still see the guide.
 */
export function operationsGuide(overview?: string): string {
  return [
    QUICK_START,
    ...(overview ? [overview] : []),
    "# Operations (tsk <operation> --help for inputs, flags and examples):",
  ].join("\n");
}

function warn(message: string) {
  console.error(`Warning: ${message}`);
}
