import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { operations } from "@typesensekit/core";
import { build, type Options } from "tsup";
import { expect, it } from "vitest";
import config from "../tsup.config.js";

const execute = promisify(execFile);

it("runs the standalone ESM bundle, including SDK requests and live discovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tsk-bundle-"));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    expect(request.headers["x-typesense-api-key"]).toBe("test-key");
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify(
        request.url === "/health"
          ? { ok: true }
          : request.url === "/aliases"
            ? { aliases: [] }
            : [{ name: "inventory", num_documents: 7, fields: [] }],
      ),
    );
  });
  try {
    await build({
      ...(config as Options),
      config: false,
      entry: [new URL("./cli.ts", import.meta.url).pathname],
      outDir: directory,
      dts: false,
      silent: true,
    });
    await writeFile(join(directory, "package.json"), '{"type":"module"}');
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const run = (...args: string[]) =>
      execute(process.execPath, [join(directory, "cli.js"), ...args], {
        env: {
          ...process.env,
          TYPESENSE_URL: `http://127.0.0.1:${address.port}`,
          TYPESENSE_API_KEY: "test-key",
          TSK_NO_OVERVIEW: "",
        },
      });
    expect(JSON.parse((await run("health", "--json")).stdout)).toEqual({
      ok: true,
    });
    expect((await run("--help")).stdout).toContain("inventory: 7 documents");
    const listing = await run("operations");
    expect(listing.stdout.split("\n").filter(Boolean)).toHaveLength(
      operations.length,
    );
    expect(listing.stdout).not.toContain("#");
    expect(listing.stderr).toContain("inventory: 7 documents");
    expect((await run("completion", "bash")).stdout).toContain(
      "complete -F _tsk_completion tsk typesensekit",
    );
    expect(requests).toEqual([
      "GET /health",
      "GET /collections",
      "GET /aliases",
      "GET /collections",
      "GET /aliases",
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    }).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
