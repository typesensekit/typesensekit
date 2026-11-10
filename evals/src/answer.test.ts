import { describe, expect, it } from "vitest";
import { extractFinalAnswer, gradeAnswer, normalize } from "./answer.js";
import type { AnswerSpec } from "./types.js";

describe("extractFinalAnswer", () => {
  it("takes the last FINAL ANSWER line", () => {
    const text =
      "Let me think. FINAL ANSWER: maybe\n\nAfter checking:\nFINAL ANSWER: 42";
    expect(extractFinalAnswer(text)).toBe("42");
  });

  it("tolerates markdown emphasis and casing", () => {
    expect(extractFinalAnswer("**Final Answer:** `not_facetable`")).toBe(
      "`not_facetable`",
    );
    expect(extractFinalAnswer("> final answer: done")).toBe("done");
  });

  it("returns null without a final answer line", () => {
    expect(extractFinalAnswer("The answer is 42.")).toBeNull();
    expect(extractFinalAnswer(undefined)).toBeNull();
    expect(extractFinalAnswer("FINAL ANSWER:   ")).toBeNull();
  });
});

describe("normalize", () => {
  it("strips quotes, emphasis, trailing punctuation, and case", () => {
    expect(normalize('  "The Burning Garden".  ')).toBe("the burning garden");
    expect(normalize("**`body`**")).toBe("body");
  });
});

describe("gradeAnswer", () => {
  it("matches text exactly after normalization, with alternatives", () => {
    const spec: AnswerSpec = {
      type: "text",
      value: "int32",
      alternatives: ["int 32"],
    };
    expect(gradeAnswer("INT32", spec).pass).toBe(true);
    expect(gradeAnswer("int 32", spec).pass).toBe(true);
    expect(gradeAnswer("int64", spec).pass).toBe(false);
  });

  it("parses numbers with currency and separators, within tolerance", () => {
    const spec: AnswerSpec = {
      type: "number",
      value: 1234.56,
      tolerance: 0.01,
    };
    expect(gradeAnswer("$1,234.56", spec).pass).toBe(true);
    expect(gradeAnswer("1234.565", spec).pass).toBe(true);
    expect(gradeAnswer("1234.6", spec).pass).toBe(false);
    expect(gradeAnswer("none", spec).pass).toBe(false);
  });

  it("compares sets regardless of order but not size", () => {
    const spec: AnswerSpec = { type: "set", values: ["Furniture", "Audio"] };
    expect(gradeAnswer("audio, furniture", spec).pass).toBe(true);
    expect(gradeAnswer("Audio; Furniture", spec).pass).toBe(true);
    expect(gradeAnswer("[Audio, and Furniture]", spec).pass).toBe(true);
    expect(gradeAnswer("Audio", spec).pass).toBe(false);
    expect(gradeAnswer("Audio, Furniture, Office", spec).pass).toBe(false);
  });

  it("compares lists in order", () => {
    const spec: AnswerSpec = { type: "list", values: ["14", "6"] };
    expect(gradeAnswer("14, 6", spec).pass).toBe(true);
    expect(gradeAnswer("6, 14", spec).pass).toBe(false);
  });

  it("fails cleanly with no answer", () => {
    const result = gradeAnswer(null, { type: "text", value: "x" });
    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/no FINAL ANSWER/);
  });
});
