import {
  type McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  formatTypesenseErrorMessage,
  type Operation,
  operations,
  redactSecrets,
  type TypesenseClient,
} from "@typesensekit/core";
import type { z } from "zod";
import { type McpOperation, READ_ONLY_OPERATION_NAMES } from "./read-only.js";

type ResourceOperationInput = {
  collection: string;
  id?: string;
};

export function jsonContents(uri: string, value: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(redactSecrets(value), null, 2),
      },
    ],
  };
}

function textContents(uri: string, value: string) {
  return {
    contents: [{ uri, mimeType: "text/plain", text: value }],
  };
}

function operationSummary(operation: Operation<z.ZodTypeAny, unknown>) {
  return {
    name: operation.name,
    summary: operation.summary,
    category: operation.category,
    readOnly: READ_ONLY_OPERATION_NAMES.has(operation.name),
  };
}

export function operationManifest(
  activeOperations: McpOperation[],
  readOnly: boolean,
) {
  return {
    readOnly,
    operations: activeOperations.map(operationSummary),
  };
}

function singleVariable(
  value: string | string[] | undefined,
  variable: string,
): string {
  if (typeof value === "string") return value;
  throw new Error(`Missing ${variable} resource variable`);
}

async function readOperationResource(
  client: TypesenseClient,
  operationName: string,
  input: ResourceOperationInput,
  uri: string,
) {
  const operation = operations.find(
    (candidate) => candidate.name === operationName,
  );
  if (!operation) throw new Error(`${operationName} not found`);

  try {
    const result = await operation.execute(
      client,
      operation.input.parse(input),
    );
    return jsonContents(uri, result);
  } catch (error) {
    return textContents(uri, formatTypesenseErrorMessage(error));
  }
}

export function registerTypesenseResources(
  server: McpServer,
  client: TypesenseClient,
  activeOperations: McpOperation[],
  readOnly: boolean,
) {
  server.registerResource(
    "typesensekit-operations",
    "typesensekit://operations",
    {
      title: "TypesenseKit Operations",
      description: "Operations currently exposed by this MCP server.",
      mimeType: "application/json",
    },
    async (uri) =>
      jsonContents(uri.href, operationManifest(activeOperations, readOnly)),
  );

  server.registerResource(
    "typesensekit-read-only-tools",
    "typesensekit://read-only-tools",
    {
      title: "TypesenseKit Read-only Tools",
      description: "Operation names included in default read-only MCP mode.",
      mimeType: "application/json",
    },
    async (uri) =>
      jsonContents(uri.href, {
        operations: [...READ_ONLY_OPERATION_NAMES].sort(),
      }),
  );

  server.registerResource(
    "typesense-collection-schema",
    new ResourceTemplate("typesense://collections/{collection}/schema", {
      list: undefined,
    }),
    {
      title: "Typesense Collection Schema",
      description: "Retrieve a Typesense collection schema by collection name.",
      mimeType: "application/json",
    },
    async (uri, variables) =>
      readOperationResource(
        client,
        "collections.retrieve",
        { collection: singleVariable(variables.collection, "collection") },
        uri.href,
      ),
  );

  server.registerResource(
    "typesense-document",
    new ResourceTemplate(
      "typesense://collections/{collection}/documents/{id}",
      {
        list: undefined,
      },
    ),
    {
      title: "Typesense Document",
      description:
        "Retrieve a Typesense document by collection and document id.",
      mimeType: "application/json",
    },
    async (uri, variables) =>
      readOperationResource(
        client,
        "documents.get",
        {
          collection: singleVariable(variables.collection, "collection"),
          id: singleVariable(variables.id, "id"),
        },
        uri.href,
      ),
  );
}
