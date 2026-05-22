import {
  formatTypesenseErrorMessage,
  getTypesenseErrorHint,
  operations,
} from "@typesensekit/core";
import { defineCommand } from "citty";
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
      description: "Confirm destructive production schema changes",
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

function operationSpecificArgs(operationName: string) {
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
          input: {
            type: "string",
            description: "JSON object matching this operation input schema",
          },
          profile: { type: "string", description: "Profile name" },
          config: { type: "string", description: "Profile config path" },
          json: { type: "boolean", description: "Print JSON" },
          debug: {
            type: "boolean",
            description: "Include redacted diagnostic details in errors",
          },
          ...operationSpecificArgs(operation.name),
        },
        async run({ args }) {
          const client = await resolveClient({
            profile: args.profile,
            config: args.config,
          });
          const input = operation.input.parse({
            ...parseInput(args.input),
            ...operationSpecificInput(operation.name, args),
          });
          try {
            const result = await operation.execute(client, input);
            console.log(render(result, args.json));
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
