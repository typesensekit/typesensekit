import { defineCommand } from "citty";
import { afterEach, expect, it, vi } from "vitest";
import {
  dispatch,
  groupHelp,
  normalizeCommand,
  operationHelp,
  suggestCommand,
} from "./dispatch.js";

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

it("normalizes grouped paths while preserving dotted commands and flag values", () => {
  expect(
    normalizeCommand(["collections", "fields", "add", "--input", "{}"]),
  ).toEqual(["collections.fields.add", "--input", "{}"]);
  expect(normalizeCommand(["search", "facets", "--json"])).toEqual([
    "search.facets",
    "--json",
  ]);
  expect(normalizeCommand(["collections.retrieve", "books"])).toEqual([
    "collections.retrieve",
    "books",
  ]);
  expect(normalizeCommand(["search", "--input", "collections.list"])).toEqual([
    "search",
    "--input",
    "collections.list",
  ]);
});

it("shows focused help with usable inputs and output format instructions", () => {
  expect(groupHelp("aliases")).toContain("aliases.retrieve");
  expect(groupHelp("aliases")).not.toContain("documents.search");
  expect(operationHelp("search")).toContain('"params":');
  expect(operationHelp("documents.export")).toContain("--format jsonl");
  expect(operationHelp("collections.retrieve")).toContain(
    "collection (required)",
  );
});

it("handles group help and reports errors without stacks or a usage banner", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const main = defineCommand({
    subCommands: {
      search: defineCommand({
        run() {
          throw new Error("Bad request");
        },
      }),
    },
  });
  await dispatch(main, ["documents", "--help"], "1.0.0");
  expect(log).toHaveBeenCalledWith(groupHelp("documents"));
  await dispatch(main, ["unknown"], "1.0.0");
  expect(error).toHaveBeenLastCalledWith(
    "Error: Unknown command: unknown. Use tsk operations or tsk --help.",
  );
  await dispatch(main, ["search"], "1.0.0");
  expect(error).toHaveBeenLastCalledWith("Error: Bad request");
  expect(process.exitCode).toBe(1);
});

it("suggests nearby operations and groups", () => {
  expect(suggestCommand("alias")).toBe("aliases");
  expect(suggestCommand("documents.serch")).toBe("documents.search");
  expect(suggestCommand("unrelated")).toBeUndefined();
});
