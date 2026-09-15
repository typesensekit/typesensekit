import { runCommand } from "citty";
import { afterEach, expect, it, vi } from "vitest";
import { operationCommands } from "./operations.js";

vi.mock("./profile/resolve.js", () => ({
  resolveClient: vi.fn(async () => ({
    apiCall: {
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
