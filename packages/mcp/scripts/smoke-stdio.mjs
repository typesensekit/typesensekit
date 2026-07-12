import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/cli.js"],
  env: {
    ...process.env,
    TYPESENSE_URL: "http://127.0.0.1:8108",
    TYPESENSE_API_KEY: "stdio-smoke-test",
  },
});
const client = new Client({ name: "typesensekit-stdio-smoke", version: "1" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === "health")) {
    throw new Error("stdio MCP smoke test did not discover the health tool");
  }
} finally {
  await client.close();
}
