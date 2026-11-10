import type { AnswerSpec } from "./types.js";

/** Returns the value of the last `FINAL ANSWER:` line, or null if there is none. */
export function extractFinalAnswer(text: string | undefined): string | null {
  if (!text) return null;
  const matches = [
    // Tolerates markdown around the label: "**Final Answer:** x", "> FINAL ANSWER: x".
    ...text.matchAll(/^[\s>*_`#-]*final answer[*_]*\s*[:：][*_]*\s*(.*)$/gim),
  ];
  const last = matches.at(-1);
  if (!last) return null;
  const value = (last[1] ?? "").replace(/\*+$/g, "").trim();
  return value.length > 0 ? value : null;
}

const EDGE = /^[*_`"'“”‘’\s]+|[*_`"'“”‘’\s.;!]+$/g;

/** Case-, whitespace-, quote-, and trailing-punctuation-insensitive form. */
export function normalize(value: string): string {
  let current = value.normalize("NFKC");
  // Repeat so mixed wrappers like `"Title".` or `**"x"**` fully unwrap.
  for (let previous = ""; previous !== current; ) {
    previous = current;
    current = current.replace(EDGE, "");
  }
  return current.replace(/\s+/g, " ").toLowerCase();
}

export function splitValues(value: string): string[] {
  const trimmed = value.trim().replace(/^\[|\]$/g, "");
  return trimmed
    .split(/\s*[,;\n]\s*/)
    .map((part) => normalize(part.replace(/^and\s+/i, "")))
    .filter((part) => part.length > 0);
}

export function parseNumber(value: string): number | null {
  const match = value.replace(/[$€£,\s]/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export type Grade = { pass: boolean; detail: string };

export function describeSpec(spec: AnswerSpec): string {
  switch (spec.type) {
    case "text":
      return [spec.value, ...(spec.alternatives ?? [])].join(" | ");
    case "number":
      return spec.tolerance
        ? `${spec.value} ± ${spec.tolerance}`
        : String(spec.value);
    case "set":
      return `{${spec.values.join(", ")}}`;
    case "list":
      return `[${spec.values.join(", ")}]`;
  }
}

export function gradeAnswer(answer: string | null, spec: AnswerSpec): Grade {
  const expected = describeSpec(spec);
  if (answer === null) {
    return {
      pass: false,
      detail: `no FINAL ANSWER line; expected ${expected}`,
    };
  }
  const got = `got "${answer}", expected ${expected}`;
  switch (spec.type) {
    case "text": {
      const accepted = [spec.value, ...(spec.alternatives ?? [])].map(
        normalize,
      );
      return { pass: accepted.includes(normalize(answer)), detail: got };
    }
    case "number": {
      const value = parseNumber(answer);
      const tolerance = spec.tolerance ?? 0;
      return {
        pass:
          value !== null && Math.abs(value - spec.value) <= tolerance + 1e-9,
        detail: got,
      };
    }
    case "set": {
      const actual = new Set(splitValues(answer));
      const wanted = new Set(spec.values.map(normalize));
      const pass =
        actual.size === wanted.size && [...wanted].every((v) => actual.has(v));
      return { pass, detail: got };
    }
    case "list": {
      const actual = splitValues(answer);
      const wanted = spec.values.map(normalize);
      const pass =
        actual.length === wanted.length &&
        wanted.every((value, index) => actual[index] === value);
      return { pass, detail: got };
    }
  }
}
