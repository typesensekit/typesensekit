import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  createClient,
  formatTypesenseErrorMessage,
  operationDescription,
  operations,
  redactSecrets,
} from "@typesensekit/core";
import { z } from "zod";
import packageJson from "../package.json" with { type: "json" };
import { createMcpAuditLogger, type McpAuditLogger } from "./audit.js";
import { readEnvConfig, readMcpOptions } from "./env.js";
import {
  type McpExecutionController,
  sharedMcpExecutionController,
} from "./execution.js";
import {
  formatMcpError,
  schemaFieldsHint,
  serverInstructions,
} from "./guidance.js";
import { filterMcpOperations } from "./read-only.js";
import { registerTypesenseResources } from "./resources.js";
import { operationToolAnnotations } from "./tool-metadata.js";
import {
  advertisedTool,
  type JsonSchema,
  slimJsonSchema,
} from "./tool-schema.js";

const outputSchema = { result: z.unknown() };

export type TypesenseMcpServerOptions = {
  readOnly?: boolean;
  executionController?: McpExecutionController;
  auditLogger?: McpAuditLogger;
};

export function createTypesenseMcpServer(
  options: TypesenseMcpServerOptions = {},
) {
  const mcpOptions = { ...readMcpOptions(), ...options };
  const server = new McpServer(
    {
      name: "typesensekit",
      version: packageJson.version,
    },
    { instructions: serverInstructions(mcpOptions.readOnly) },
  );
  const client = createClient(readEnvConfig());
  const execution =
    options.executionController ?? sharedMcpExecutionController();
  const audit = options.auditLogger ?? createMcpAuditLogger();

  const activeOperations = filterMcpOperations(operations, mcpOptions.readOnly);

  registerTypesenseResources(
    server,
    client,
    activeOperations,
    mcpOptions.readOnly,
    execution,
  );

  for (const operation of activeOperations) {
    server.registerTool(
      operation.name,
      {
        title: operation.name,
        description: operationDescription(operation),
        inputSchema: operation.input,
        outputSchema,
        annotations: operationToolAnnotations(operation),
      },
      async (args) => {
        const startedAt = Date.now();
        audit.record({
          timestamp: new Date(startedAt).toISOString(),
          operation: operation.name,
          outcome: "started",
        });
        try {
          const input = operation.input.parse(args);
          const result = await execution.run(() =>
            operation.execute(client, input),
          );
          const safeResult = redactSecrets(result);
          const text = execution.serialize(safeResult);
          audit.record({
            timestamp: new Date().toISOString(),
            operation: operation.name,
            outcome: "succeeded",
            durationMs: Date.now() - startedAt,
          });
          return {
            structuredContent: { result: safeResult },
            content: [
              {
                type: "text",
                text,
              },
            ],
          };
        } catch (error) {
          audit.record({
            timestamp: new Date().toISOString(),
            operation: operation.name,
            outcome: "failed",
            durationMs: Date.now() - startedAt,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          const context = {
            operation: operation.name,
            input: args,
            readOnly: mcpOptions.readOnly,
          };
          const raw = formatTypesenseErrorMessage(error);
          const fields = await schemaFieldsHint(raw, context, client);
          const message = [
            formatMcpError(raw, { ...context, fieldsListed: Boolean(fields) }),
            fields,
          ]
            .filter(Boolean)
            .join("\n");
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      },
    );
  }

  advertiseCompactToolList(server, activeOperations);
  return server;
}

/**
 * Serves tools/list with compact definitions (see tool-schema.ts). Calls are
 * still validated by the full schemas registered above.
 */
function advertiseCompactToolList(
  server: McpServer,
  activeOperations: ReturnType<typeof filterMcpOperations>,
) {
  const outputJsonSchema = slimJsonSchema(
    toJsonSchemaCompat(z.object(outputSchema)),
  );
  const tools = activeOperations.map((operation) => {
    const { description, inputSchema } = advertisedTool(
      operation.name,
      operationDescription(operation),
      toJsonSchemaCompat(operation.input) as JsonSchema,
    );
    return {
      name: operation.name,
      title: operation.name,
      description,
      inputSchema: inputSchema as { type: "object" },
      outputSchema: outputJsonSchema as { type: "object" },
      annotations: operationToolAnnotations(operation),
    };
  });
  server.server.removeRequestHandler("tools/list");
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
}
