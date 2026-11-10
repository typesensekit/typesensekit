import { expect, it } from "vitest";
import {
  coerceFlagValue,
  hoistParams,
  parseArgv,
  snakeCase,
  unknownKeyHint,
} from "./cli-input.js";
import { buildOperationInput } from "./operations.js";

it("parses flag values without stealing positionals after boolean flags", () => {
  const booleans = new Set(["json", "compact"]);
  expect(
    parseArgv(
      ["--q", "shoes", "products", "--compact", "--per-page=0", "--json"],
      (key) => booleans.has(key),
    ),
  ).toEqual({
    positionals: ["products"],
    flags: [
      { key: "q", value: "shoes" },
      { key: "compact", value: true },
      { key: "per-page", value: "0" },
      { key: "json", value: true },
    ],
  });
  expect(parseArgv(["--offset", "-5"], () => false).flags).toEqual([
    { key: "offset", value: "-5" },
  ]);
});

it("coerces flag values to the schema type", () => {
  expect(coerceFlagValue("5", { type: "integer" })).toBe(5);
  expect(coerceFlagValue("false", { type: "boolean" })).toBe(false);
  expect(coerceFlagValue("a, b", { type: "array" })).toEqual(["a", "b"]);
  expect(coerceFlagValue('{"a":1}', { type: "object" })).toEqual({ a: 1 });
  expect(coerceFlagValue("007", { type: "string" })).toBe("007");
  expect(snakeCase("perPage")).toBe("per_page");
  expect(snakeCase("filter-by")).toBe("filter_by");
});

it("moves flat search keys into params and defaults q to *", () => {
  const keys = ["collection", "params", "compact"];
  expect(
    hoistParams(
      "search",
      { collection: "c", filter_by: "x:=1", compact: true },
      keys,
    ),
  ).toEqual({
    collection: "c",
    compact: true,
    params: { q: "*", filter_by: "x:=1" },
  });
  expect(
    hoistParams(
      "documents.search",
      { collection: "c", per_page: 0, params: { q: "a", per_page: 5 } },
      keys,
    ),
  ).toEqual({ collection: "c", params: { q: "a", per_page: 5 } });
  expect(hoistParams("documents.export", { collection: "c" }, keys)).toEqual({
    collection: "c",
  });
  expect(hoistParams("aliases.retrieve", { other: 1 }, ["name"])).toEqual({
    other: 1,
  });
});

it("names unknown input fields", () => {
  expect(unknownKeyHint({ preset_name: "x" }, ["name"])).toBe(
    "Unknown input field: preset_name. Valid fields: name.",
  );
  expect(unknownKeyHint({ name: "x", yes: true }, ["name"])).toBeUndefined();
});

it("builds search input from positionals and Typesense param flags", () => {
  expect(
    buildOperationInput(
      "search",
      [
        "products",
        "--filter-by",
        "price:<100",
        "--per-page",
        "0",
        "--compact",
        "--json",
      ],
      { json: true },
    ),
  ).toEqual({
    collection: "products",
    compact: true,
    params: { q: "*", filter_by: "price:<100", per_page: "0" },
  });
  expect(
    buildOperationInput(
      "search",
      ["--input", '{"collection":"p","params":{"q":"a"}}', "--sort-by", "x"],
      { input: '{"collection":"p","params":{"q":"a"}}' },
    ),
  ).toEqual({ collection: "p", params: { q: "a", sort_by: "x" } });
});

it("maps --<field> flags onto input fields and rejects unknown options", () => {
  expect(
    buildOperationInput(
      "documents.get_many",
      ["--collection", "books", "--ids", "a,b"],
      {},
    ),
  ).toEqual({ collection: "books", ids: ["a", "b"] });
  expect(
    buildOperationInput(
      "documents.delete_by_filter",
      ["products", "--filter-by", "in_stock:=false"],
      {},
    ),
  ).toEqual({ collection: "products", filterBy: "in_stock:=false" });
  expect(() =>
    buildOperationInput("collections.list", ["--bogus", "1"], {}),
  ).toThrow("Unknown option --bogus");
  expect(() => buildOperationInput("aliases.retrieve", ["a", "b"], {})).toThrow(
    "Unexpected argument",
  );
});
