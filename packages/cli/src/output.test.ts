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

  it("renders JSON", () => {
    expect(render({ ok: true }, true)).toBe('{\n  "ok": true\n}');
  });
});
