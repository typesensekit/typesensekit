import { runCommand } from "citty";
import { afterEach, expect, it, vi } from "vitest";
import { operationCommands } from "./operations.js";

vi.mock("./profile/resolve.js", () => ({
  resolveClient: vi.fn(async () => ({
    apiCall: {
      get: vi.fn(async (path: string) =>
        path.endsWith("/documents/export")
          ? '{"id":"1"}\n{"id":"2"}\n'
          : { name: path },
      ),
      post: vi.fn(async () => ({
        value: "generated-key",
        actions: ["documents:search"],
        collections: ["products"],
        api_key: "other-secret",
      })),
    },
  })),
}));
afterEach(() => vi.restoreAllMocks());

it("requires explicit CLI reveal for newly created keys", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const command = operationCommands()["keys.create"];
  if (!command) throw new Error("Missing command");
  const rawArgs = [
    "--input",
    JSON.stringify({
      value: { actions: ["documents:search"], collections: ["products"] },
    }),
    "--json",
  ];
  await runCommand(command, { rawArgs });
  expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject({
    value: "[REDACTED]",
    api_key: "[REDACTED]",
  });
  await runCommand(command, { rawArgs: [...rawArgs, "--reveal"] });
  expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject({
    value: "generated-key",
    api_key: "[REDACTED]",
  });
});

it("reports validation errors with a usable invocation", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const command = operationCommands()["keys.create"];
  if (!command) throw new Error("Missing command");
  // Validation errors include a directly usable invocation, without a Zod stack.
  await expect(runCommand(command, { rawArgs: [] })).rejects.toThrow(
    "tsk keys.create --input",
  );
  expect(output).not.toHaveBeenCalled();
});

it("accepts positional names and lets explicit JSON take precedence", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const command = operationCommands()["aliases.retrieve"];
  if (!command) throw new Error("Missing command");
  await runCommand(command, { rawArgs: ["catalog", "--json"] });
  expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toEqual({
    name: "/aliases/catalog",
  });
  await runCommand(command, {
    rawArgs: ["catalog", "--input", '{"name":"other"}', "--json"],
  });
  expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toEqual({
    name: "/aliases/other",
  });
});

it("adds raw JSONL and array exports while preserving the existing JSON string", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const command = operationCommands()["documents.export"];
  if (!command) throw new Error("Missing command");
  const rawArgs = ["--input", '{"collection":"products"}'];
  await runCommand(command, { rawArgs: [...rawArgs, "--json"] });
  expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toBe(
    '{"id":"1"}\n{"id":"2"}\n',
  );
  await runCommand(command, { rawArgs: [...rawArgs, "--format", "jsonl"] });
  expect(String(output.mock.calls.at(-1)?.[0])).toBe('{"id":"1"}\n{"id":"2"}');
  await runCommand(command, { rawArgs: [...rawArgs, "--format", "array"] });
  expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toEqual([
    { id: "1" },
    { id: "2" },
  ]);
});
