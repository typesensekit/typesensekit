import { createServer } from "node:http";
import { expect, it } from "vitest";
import { createClient } from "../client.js";
import { documentOperations } from "./documents.js";
import { stemmingOperations } from "./stemming.js";

it("sends JSONL verbatim and preserves single-line text responses through the SDK", async () => {
  const requests: Array<{
    path: string;
    body: string;
    contentType: string | undefined;
  }> = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      path: request.url ?? "",
      body,
      contentType: request.headers["content-type"],
    });
    response
      .writeHead(200, { "content-type": "text/plain" })
      .end(request.url?.includes("export") ? '{"id":"1"}' : '{"success":true}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const client = createClient({
    url: `http://127.0.0.1:${address.port}`,
    apiKey: "test",
    numRetries: 0,
  });
  async function run(name: string, input: unknown) {
    const operation = [...documentOperations, ...stemmingOperations].find(
      (entry) => entry.name === name,
    );
    if (!operation) throw new Error(`Missing ${name}`);
    return operation.execute(client, operation.input.parse(input));
  }
  try {
    expect(
      await run("documents.import", {
        collection: "test",
        documents: [{ id: "1" }, { id: "2" }],
      }),
    ).toBe('{"success":true}');
    expect(requests[0]).toMatchObject({
      body: '{"id":"1"}\n{"id":"2"}',
      contentType: "text/plain",
    });
    expect(await run("documents.export", { collection: "test" })).toBe(
      '{"id":"1"}',
    );
    await run("stemming.dictionaries.import", {
      id: "test",
      words: [
        { word: "people", root: "person" },
        { word: "children", root: "child" },
      ],
    });
    expect(requests[2]).toMatchObject({
      body: '{"word":"people","root":"person"}\n{"word":"children","root":"child"}',
      contentType: "text/plain",
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
