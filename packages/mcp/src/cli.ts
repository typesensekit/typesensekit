import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTypesenseMcpServer } from "./server.js";

const server = createTypesenseMcpServer();
await server.connect(new StdioServerTransport());
