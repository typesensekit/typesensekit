import {
  formatTypesenseErrorMessage,
  getTypesenseErrorHint,
  operations,
} from "@typesensekit/core";
import { type ArgsDef, defineCommand } from "citty";
import { ZodError } from "zod";
import { confirmDestructiveOperation } from "./confirmation.js";
import {
  inputObjectSchema,
  renderInputSchema,
  renderOperationExamples,
} from "./operation-docs.js";
import { parseInput, render } from "./output.js";
import { resolveClient } from "./profile/resolve.js";

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

export function operationCommands() {
  return Object.fromEntries(
    operations.map((operation) => [
      operation.name,
      defineCommand({
        meta: { name: operation.name, description: operation.summary },
        args: {
          ...Object.fromEntries(
            Object.entries(inputObjectSchema(operation.input).properties ?? {})
              .filter(
                ([key, schema]) =>
                  schema.type === "string" &&
                  inputObjectSchema(operation.input).required?.includes(key) &&
                  !(key in operationSpecificArgs(operation.name)),
              )
              .map(([key]) => [
                key,
                {
                  type: "positional" as const,
                  required: false,
                  description: `Input ${key} (or use --input)`,
                },
              ]),
          ),
          ...(operation.name === "documents.export"
            ? {
                format: {
                  type: "string" as const,
                  description:
                    "jsonl | array (default: JSON string; --json unchanged)",
                },
              }
            : {}),
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
          ...operationSpecificArgs(operation.name),
        },
        async run({ args }) {
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

          const positional = Object.fromEntries(
            Object.keys(inputObjectSchema(operation.input).properties ?? {})
              .filter(
                (key) =>
                  !(key in operationSpecificArgs(operation.name)) &&
                  typeof args[key] === "string",
              )
              .map((key) => [key, args[key]]),
          );
          let input: Record<string, unknown>;
          try {
            input = operation.input.parse({
              ...positional,
              ...parseInput(args.input),
              ...operationSpecificInput(operation.name, args),
            });
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
            throw new Error(
              `Invalid input for ${operation.name}: ${detail}\n${renderOperationExamples(operation.name, operation.input)}\nUse tsk ${operation.name} --schema for the full input schema.`,
            );
          }
          if (
            args.format !== undefined &&
            !["jsonl", "array"].includes(String(args.format))
          ) {
            throw new Error("--format must be jsonl or array");
          }
          await confirmDestructiveOperation(operation.name, input, args.yes);
          const client = await resolveClient({
            profile: args.profile,
            config: args.config,
          });
          try {
            const result = await operation.execute(client, input);
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
            console.log(
              render(
                result,
                args.json,
                operation.name === "keys.create" && args.reveal === true,
              ),
            );
          } catch (error) {
            const hint = getTypesenseErrorHint(error, input);
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

export function listOperations(): string {
  return operations
    .map((operation) => `${operation.name}\t${operation.summary}`)
    .join("\n");
}
