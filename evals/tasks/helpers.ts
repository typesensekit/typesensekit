import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, ok } from "../src/oracle.js";
import { EVALS_ROOT } from "../src/paths.js";
import type { StateCheckResult } from "../src/types.js";
import type { SearchParams, TypesenseHttp } from "../src/typesense.js";

/** Rows of a committed dataset file, i.e. the state right after seeding. */
export function seedRows<T>(file: string): T[] {
  return readFileSync(join(EVALS_ROOT, "datasets", file), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

export async function docCount(
  ts: TypesenseHttp,
  collection: string,
  expected: number,
): Promise<StateCheckResult> {
  const info = await ts.find<{ num_documents: number }>(
    `/collections/${encodeURIComponent(collection)}`,
  );
  if (!info) return fail(`${collection} no longer exists`);
  return info.num_documents === expected
    ? ok(`${collection} has ${expected} documents`)
    : fail(
        `${collection} has ${info.num_documents} documents, expected ${expected}`,
      );
}

/** Every hit for a search, paging through 250 at a time. */
export async function allHitIds(
  ts: TypesenseHttp,
  collection: string,
  params: SearchParams,
): Promise<{ found: number; ids: string[] }> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const result = await ts.search(collection, {
      ...params,
      per_page: 250,
      page,
    });
    for (const hit of result.hits ?? []) ids.push(String(hit.document.id));
    if ((result.hits?.length ?? 0) < 250 || page >= 40) {
      return { found: result.found, ids };
    }
  }
}

/** Runs a check, turning a thrown Typesense error into a failed result. */
export async function attempt(
  label: string,
  run: () => Promise<StateCheckResult>,
): Promise<StateCheckResult> {
  try {
    return await run();
  } catch (error) {
    return fail(
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Passes when `collection` holds exactly the expected documents, compared
 * field by field (ids, values, and nothing missing or extra).
 */
export async function sameDocuments(
  ts: TypesenseHttp,
  collection: string,
  expected: Record<string, unknown>[] | object[],
): Promise<StateCheckResult> {
  const actual = new Map(
    (await ts.exportDocuments<Record<string, unknown>>(collection)).map(
      (doc) => [String(doc.id), doc],
    ),
  );
  const rows = expected as Record<string, unknown>[];
  const problems: string[] = [];
  for (const want of rows) {
    const got = actual.get(String(want.id));
    if (!got) {
      problems.push(`${want.id} missing`);
      continue;
    }
    const changed = Object.keys(want).filter(
      (key) => JSON.stringify(got[key]) !== JSON.stringify(want[key]),
    );
    if (changed.length > 0)
      problems.push(`${want.id} differs in ${changed.join(", ")}`);
  }
  if (actual.size !== rows.length) {
    problems.push(`${actual.size} documents, expected ${rows.length}`);
  }
  return problems.length === 0
    ? ok(`${collection} holds all ${rows.length} documents intact`)
    : fail(`${collection}: ${problems.slice(0, 3).join("; ")}`);
}
