import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const url = process.env.TYPESENSEKIT_TEST_URL;
const apiKey = process.env.TYPESENSEKIT_TEST_API_KEY;
const httpUrl = process.env.TYPESENSEKIT_TEST_MCP_URL;
const bearer = process.env.TYPESENSEKIT_TEST_MCP_TOKEN;
assert(
  url && apiKey && httpUrl && bearer,
  "Set all TYPESENSEKIT_TEST_* connection variables for a disposable test cluster",
);
const env = { ...process.env, TYPESENSE_URL: url, TYPESENSE_API_KEY: apiKey };
const collection = `tsk_test_${Date.now()}`;
const temporary = await mkdtemp(join(tmpdir(), "tsk-live-"));
const clients = [];
let created = false;
let generatedKeyId;
let checks = 0;

function passed(message) {
  checks++;
  console.log(`PASS ${message}`);
}
async function cli(name, input, flags = [], overrides = {}) {
  const { stdout } = await exec(
    process.execPath,
    [
      join(root, "packages/cli/dist/cli.js"),
      name,
      "--input",
      JSON.stringify(input),
      "--json",
      ...flags,
    ],
    { env: { ...env, ...overrides }, timeout: 30000 },
  );
  return JSON.parse(stdout);
}
async function connect(transport) {
  const client = new Client({ name: "typesensekit-live-test", version: "1" });
  clients.push(client);
  await client.connect(transport);
  return client;
}
async function tool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert(!result.isError, JSON.stringify(result));
  return result.structuredContent.result;
}
try {
  assert.equal((await cli("health", {})).ok, true);
  passed("CLI connects to real Typesense");
  await cli("collections.create", {
    name: collection,
    fields: [
      { name: "title", type: "string" },
      { name: "price", type: "float" },
    ],
  });
  created = true;
  const docs = [
    { id: "1", title: "Oak chair", price: 100 },
    { id: "2", title: "Walnut table", price: 250 },
  ];
  const imported = await cli(
    "documents.import",
    { collection, documents: docs, action: "upsert" },
    ["--yes"],
  );
  const rows =
    typeof imported === "string"
      ? imported
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : imported;
  assert.equal(rows.length, 2);
  assert(rows.every((row) => row.success));
  passed("CLI imports JSONL successfully");
  const singleImport = await cli(
    "documents.import",
    { collection, documents: [docs[0]], action: "upsert" },
    ["--yes"],
  );
  assert.equal(typeof singleImport, "string");
  assert.equal(JSON.parse(singleImport).success, true);
  const singleExport = await cli("documents.export", {
    collection,
    params: { filter_by: "id:=1" },
  });
  assert.equal(typeof singleExport, "string");
  assert.equal(JSON.parse(singleExport).id, "1");
  passed("Single-document import/export preserves JSONL text");
  assert.equal(
    (
      await cli("documents.search", {
        collection,
        params: { q: "chair", query_by: "title" },
      })
    ).found,
    1,
  );
  const batch = await cli("documents.get_many", {
    collection,
    ids: ["2", "1"],
  });
  assert.deepEqual(
    batch.map((doc) => doc.id),
    ["2", "1"],
  );
  const exported = await cli("documents.export", { collection });
  assert.equal(exported.trim().split("\n").length, 2);
  passed("CLI search, ordered batch reads, and export");
  await assert.rejects(
    cli("collections.update", {
      collection,
      fields: [{ name: "price", drop: true }],
    }),
    /without confirmation/,
  );
  assert(
    (await cli("collections.retrieve", { collection })).fields.some(
      (field) => field.name === "price",
    ),
  );
  passed("Unconfirmed schema drop is blocked before mutation");
  const key = await cli(
    "keys.create",
    {
      value: {
        description: "Disposable test key",
        actions: ["documents:search"],
        collections: [collection],
      },
    },
    ["--reveal"],
  );
  generatedKeyId = key.id;
  assert(key.value && key.value !== "[REDACTED]");
  assert.equal(
    (
      await cli(
        "documents.search",
        { collection, params: { q: "chair", query_by: "title" } },
        [],
        { TYPESENSE_API_KEY: key.value },
      )
    ).found,
    1,
  );
  await assert.rejects(
    cli("collections.list", {}, [], { TYPESENSE_API_KEY: key.value }),
  );
  passed("Revealed generated key works with scoped permissions");
  const profile = join(temporary, "config.json");
  await exec(
    process.execPath,
    [
      join(root, "packages/cli/dist/cli.js"),
      "profile",
      "add",
      "test",
      "--url",
      url,
      "--api-key",
      apiKey,
      "--config",
      profile,
    ],
    { env, timeout: 30000 },
  );
  assert.equal(
    (
      await cli("health", {}, ["--config", profile, "--profile", "test"], {
        TYPESENSE_URL: "http://127.0.0.1:1",
        TYPESENSE_API_KEY: "invalid",
      })
    ).ok,
    true,
  );
  passed("Explicit profile overrides conflicting environment credentials");

  const stdio = await connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(root, "packages/mcp/dist/cli.js")],
      env: { ...env, TYPESENSEKIT_READ_ONLY: "true" },
    }),
  );
  const { tools } = await stdio.listTools();
  assert(tools.some((entry) => entry.name === "documents.search"));
  assert(
    !tools.some(
      (entry) =>
        entry.name === "collections.delete" ||
        entry.name === "keys.create" ||
        entry.name === "api.call",
    ),
  );
  assert.equal(
    (
      await tool(stdio, "documents.search", {
        collection,
        params: { q: "chair", query_by: "title" },
      })
    ).found,
    1,
  );
  const resource = await stdio.readResource({
    uri: `typesense://collections/${collection}/documents/1`,
  });
  assert.equal(JSON.parse(resource.contents[0].text).title, "Oak chair");
  passed("Read-only stdio MCP tools and resources query real data");
  const full = await connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(root, "packages/mcp/dist/cli.js")],
      env: { ...env, TYPESENSEKIT_READ_ONLY: "false" },
    }),
  );
  await tool(full, "collections.fields.add", {
    collection,
    field: "brand",
    type: "string",
    optional: true,
    facet: true,
  });
  const schema = await tool(full, "collections.retrieve", { collection });
  assert(
    schema.fields.some(
      (field) =>
        field.name === "brand" && field.type === "string" && field.facet,
    ),
  );
  passed("Full-access MCP preserves field definitions through Typesense");

  const unauthorized = await fetch(httpUrl, { method: "POST" });
  assert.equal(unauthorized.status, 401);
  const forbidden = await fetch(httpUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      origin: "https://untrusted.example",
    },
  });
  assert.equal(forbidden.status, 403);
  passed("Docker HTTP transport rejects missing auth and untrusted origins");
  const http = await connect(
    new StreamableHTTPClientTransport(new URL(httpUrl), {
      requestInit: { headers: { authorization: `Bearer ${bearer}` } },
    }),
  );
  assert.equal((await tool(http, "health")).ok, true);
  assert.equal(
    (
      await tool(http, "documents.search", {
        collection,
        params: { q: "chair", query_by: "title" },
      })
    ).found,
    1,
  );
  const httpResource = await http.readResource({
    uri: `typesense://collections/${collection}/schema`,
  });
  assert.equal(JSON.parse(httpResource.contents[0].text).name, collection);
  passed("Built Docker image serves authenticated MCP tools and resources");
  await cli(
    "collections.update",
    { collection, fields: [{ name: "brand", drop: true }] },
    ["--yes"],
  );
  assert(
    !(await cli("collections.retrieve", { collection })).fields.some(
      (field) => field.name === "brand",
    ),
  );
  passed("Explicitly confirmed schema mutation succeeds");
  console.log(`Completed ${checks} live integration checks`);
} finally {
  await Promise.allSettled(clients.map((client) => client.close()));
  try {
    if (generatedKeyId !== undefined)
      await cli("keys.delete", { id: generatedKeyId }, ["--yes"]);
    if (created) await cli("collections.delete", { collection }, ["--yes"]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
