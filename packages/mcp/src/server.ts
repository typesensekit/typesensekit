import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createClient,
  formatTypesenseErrorMessage,
  operations,
  redactSecrets,
} from "@typesensekit/core";
import type { z } from "zod";
import packageJson from "../package.json" with { type: "json" };
import { readEnvConfig, readMcpOptions } from "./env.js";
import {
  type McpExecutionController,
  sharedMcpExecutionController,
} from "./execution.js";
import { filterMcpOperations } from "./read-only.js";
import { registerTypesenseResources } from "./resources.js";

type ToolShape = z.ZodObject<z.ZodRawShape>;

function toToolShape(input: z.ZodTypeAny): z.ZodRawShape {
  const objectInput = input as ToolShape;
  return objectInput.shape;
}

export type TypesenseMcpServerOptions = {
  readOnly?: boolean;
  executionController?: McpExecutionController;
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
      },
      async (args) => {
        try {
          const input = operation.input.parse(args);
          const result = await execution.run(() =>
            operation.execute(client, input),
          );
          const safeResult = redactSecrets(result);
          return {
            content: [
              {
                type: "text",
                text: execution.serialize(safeResult),
              },
            ],
          };
        } catch (error) {
          const message = formatTypesenseErrorMessage(error);
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      },
    );
  }

  return server;
}
