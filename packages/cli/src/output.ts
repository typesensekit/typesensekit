import { readFileSync } from "node:fs";
import { redactSecrets } from "@typesensekit/core";

export function render(
  value: unknown,
  json = false,
  revealCreatedKey = false,
): string {
  const safeValue = redactSecrets(value);
  if (
    revealCreatedKey &&
    typeof value === "object" &&
    value !== null &&
    typeof safeValue === "object" &&
    safeValue !== null &&
    "value" in value &&
    typeof value.value === "string" &&
    "actions" in value &&
    Array.isArray(value.actions) &&
    "collections" in value &&
    Array.isArray(value.collections)
  ) {
    (safeValue as Record<string, unknown>).value = value.value;
  }
  if (json || typeof safeValue !== "object" || safeValue === null) {
    return JSON.stringify(safeValue, null, 2);
  }
  if (Array.isArray(safeValue)) {
    if (safeValue.length === 0) return "No results.";
    if (safeValue.every(isFlatRecord)) return renderTable(safeValue);
    return JSON.stringify(safeValue, null, 2);
  }
  if (isFlatRecord(safeValue)) {
    return renderTable(
      Object.entries(safeValue).map(([key, entry]) => ({ key, value: entry })),
      ["key", "value"],
    );
  }
  return JSON.stringify(safeValue, null, 2);
}

type FlatRecord = Record<string, string | number | boolean | null>;

function isFlatRecord(value: unknown): value is FlatRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (entry) => entry === null || typeof entry !== "object",
    )
  );
}

function cell(value: FlatRecord[string] | undefined): string {
  if (value === undefined || value === null) return "";
  return String(value).replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

function renderTable(rows: FlatRecord[], preferredColumns?: string[]): string {
  const columns = preferredColumns ?? [
    ...new Set(rows.flatMap((row) => Object.keys(row))),
  ];
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => cell(row[column]).length)),
  );
  const line = (values: string[]) =>
    values
      .map((value, index) => value.padEnd(widths[index] ?? value.length))
      .join("  ")
      .trimEnd();

  return [
    line(columns),
    line(columns.map((_, index) => "-".repeat(widths[index] ?? 0))),
    ...rows.map((row) => line(columns.map((column) => cell(row[column])))),
  ].join("\n");
}

export function parseInput(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  const source = raw.trim();
  const input =
    source.startsWith("{") || source.startsWith("[")
      ? source
      : readFileSync(source, "utf8");
  const parsed = JSON.parse(input) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("--input must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}
