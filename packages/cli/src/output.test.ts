import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseInput, render } from "./output.js";

describe("cli output", () => {
  it("parses object input", () => {
    expect(parseInput('{"collection":"books"}')).toEqual({
      collection: "books",
    });
  });

  it("rejects non-object input", () => {
    expect(() => parseInput("[]")).toThrow("JSON object");
  });

  it("parses object input from a JSON file", () => {
    const dir = mkdtempSync(join(tmpdir(), "typesensekit-"));
    const file = join(dir, "field.json");
    writeFileSync(file, '{"name":"title_embedding","type":"float[]"}');

    expect(parseInput(file)).toEqual({
      name: "title_embedding",
      type: "float[]",
    });
  });

  it("renders JSON", () => {
    expect(render({ ok: true }, true)).toBe('{\n  "ok": true\n}');
  });

  it("redacts secret keys in rendered output", () => {
    expect(
      render({
        embed: {
          model_config: {
            api_key: "sk-real",
          },
        },
      }),
    ).toBe(
      '{\n  "embed": {\n    "model_config": {\n      "api_key": "[REDACTED]"\n    }\n  }\n}',
    );
  });

  it("renders a flat object as key/value rows", () => {
    expect(render({ ok: true, code: 200 })).toBe(
      "key   value\n----  -----\nok    true\ncode  200",
    );
  });

  it("renders flat arrays as aligned tables", () => {
    expect(
      render([
        { name: "books", count: 2 },
        { name: "longer-name", count: 10 },
      ]),
    ).toBe(
      "name         count\n-----------  -----\nbooks        2\nlonger-name  10",
    );
  });

  it("keeps JSON mode machine-readable and redacted", () => {
    const output = render([{ name: "books", api_key: "secret" }], true);
    expect(JSON.parse(output)).toEqual([
      { name: "books", api_key: "[REDACTED]" },
    ]);
  });

  it("escapes newlines inside table cells", () => {
    expect(render([{ message: "first\nsecond" }])).toContain("first\\nsecond");
  });

  it("renders empty arrays clearly", () => {
    expect(render([])).toBe("No results.");
  });
});

it("reveals only the generated key when explicitly requested", () => {
  const key = {
    value: "new-key",
    actions: ["documents:search"],
    collections: ["products"],
    api_key: "other-secret",
  };
  expect(JSON.parse(render(key, true)).value).toBe("[REDACTED]");
  expect(JSON.parse(render(key, true, true))).toMatchObject({
    value: "new-key",
    api_key: "[REDACTED]",
  });
  expect(key.api_key).toBe("other-secret");
});
