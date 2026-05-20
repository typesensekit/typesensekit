import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createClient, operations, redactSecrets } from "@typesensekit/core";
import type { z } from "zod";
import { readEnvConfig } from "./env.js";

type ToolShape = z.ZodObject<z.ZodRawShape>;

function toToolShape(input: z.ZodTypeAny): z.ZodRawShape {
  const objectInput = input as ToolShape;
  return objectInput.shape;
}

export function createTypesenseMcpServer() {
  const server = new McpServer({ name: "typesensekit", version: "0.0.0" });
  const client = createClient(readEnvConfig());

  for (const operation of operations) {
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
          const result = await operation.execute(client, input);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(redactSecrets(result), null, 2),
              },
            ],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return { isError: true, content: [{ type: "text", text: message }] };
        }
      },
    );
  }

  return server;
}
