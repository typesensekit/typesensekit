/**
 * Helpers for task oracles. Expected answers are computed from the freshly
 * seeded cluster with direct HTTP reads, so the datasets can change without
 * hand-maintained constants drifting. Oracles throw on ambiguous data (ties)
 * so `--dry-run` catches tasks whose answer is not unique.
 */
import type { AnswerSpec, StateCheckResult } from "./types.js";
import type { TypesenseHttp } from "./typesense.js";

export type Product = {
  id: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  price: number;
  rating: number;
  in_stock: boolean;
  tags: string[];
  release_year: number;
  num_reviews: number;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  genre: string;
  year: number;
  pages: number;
  rating: number;
  language: string;
  isbn: string;
};

export type Article = {
  id: string;
  title: string;
  body: string;
  category: string;
  product_area?: string;
  views: number;
  published: boolean;
};

export const products = (ts: TypesenseHttp) =>
  ts.exportDocuments<Product>("products");
export const books = (ts: TypesenseHttp) => ts.exportDocuments<Book>("books");
export const articles = (ts: TypesenseHttp) =>
  ts.exportDocuments<Article>("support_articles");

/** The single item with the highest score; throws if the top score is tied. */
export function uniqueMax<T>(
  items: T[],
  score: (item: T) => number,
  label: string,
): T {
  const sorted = [...items].sort((a, b) => score(b) - score(a));
  const [first, second] = sorted;
  if (first === undefined) throw new Error(`${label}: no candidates`);
  if (second !== undefined && score(second) === score(first)) {
    throw new Error(`${label}: tie at ${score(first)}`);
  }
  return first;
}

export function uniqueMin<T>(
  items: T[],
  score: (item: T) => number,
  label: string,
): T {
  return uniqueMax(items, (item) => -score(item), label);
}

/** Value with the n-th highest count (1-based); throws on a tie at that rank. */
export function nthMostCommon(
  values: string[],
  n: number,
  label: string,
): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const target = ranked[n - 1];
  if (!target) throw new Error(`${label}: fewer than ${n} distinct values`);
  const ties = ranked.filter(([, count]) => count === target[1]);
  if (ties.length > 1) {
    throw new Error(`${label}: tie between ${ties.map(([v]) => v).join(", ")}`);
  }
  return target[0];
}

export const text = (value: string, ...alternatives: string[]): AnswerSpec => ({
  type: "text",
  value,
  alternatives,
});
export const number = (value: number, tolerance = 0): AnswerSpec => ({
  type: "number",
  value,
  tolerance,
});
export const set = (values: string[]): AnswerSpec => ({ type: "set", values });
export const list = (values: string[]): AnswerSpec => ({
  type: "list",
  values,
});

export const ok = (detail: string): StateCheckResult => ({
  pass: true,
  detail,
});
export const fail = (detail: string): StateCheckResult => ({
  pass: false,
  detail,
});

/** Runs checks in order and returns the first failure, or a combined pass. */
export async function allOf(
  checks: (() => Promise<StateCheckResult>)[],
): Promise<StateCheckResult> {
  const details: string[] = [];
  for (const check of checks) {
    const result = await check();
    if (!result.pass) return result;
    details.push(result.detail);
  }
  return ok(details.join("; "));
}
