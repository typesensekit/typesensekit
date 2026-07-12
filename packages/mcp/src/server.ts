import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createClient,
  formatTypesenseErrorMessage,
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
import { filterMcpOperations } from "./read-only.js";
import { registerTypesenseResources } from "./resources.js";
import { operationToolAnnotations } from "./tool-metadata.js";

type ToolShape = z.ZodObject<z.ZodRawShape>;

function toToolShape(input: z.ZodTypeAny): z.ZodRawShape {
  const objectInput = input as ToolShape;
  return objectInput.shape;
}

export type TypesenseMcpServerOptions = {
  readOnly?: boolean;
  executionController?: McpExecutionController;
  auditLogger?: McpAuditLogger;
};

export function createTypesenseMcpServer(
  options: TypesenseMcpServerOptions = {},
) {
  const server = new McpServer({
    name: "typesensekit",
    version: packageJson.version,
  });
  const client = createClient(readEnvConfig());
  const mcpOptions = { ...readMcpOptions(), ...options };
  const execution =
    options.executionController ?? sharedMcpExecutionController();
  const audit = options.auditLogger ?? createMcpAuditLogger();

  const activeOperations = filterMcpOperations(operations, mcpOptions.readOnly);

  registerTypesenseResources(
    server,
    client,
    activeOperations,
    mcpOptions.readOnly,
  );

  for (const operation of activeOperations) {
    server.registerTool(
      operation.name,
      {
        title: operation.name,
        description: operation.summary,
        inputSchema: toToolShape(operation.input),
        outputSchema: { result: z.unknown() },
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
                text: execution.serialize(safeResult),
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
          const message = formatTypesenseErrorMessage(error);
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      },
    );
  }

  return server;
}
