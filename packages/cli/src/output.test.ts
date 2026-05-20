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
});
