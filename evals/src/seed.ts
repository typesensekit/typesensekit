import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EVALS_ROOT } from "./paths.js";
import type { TypesenseHttp } from "./typesense.js";

type CollectionFixture = {
  name: string;
  documents: string;
  [key: string]: unknown;
};

type Fixtures = {
  synonym_sets: Record<string, { items: object[] }>;
  curation_sets: Record<string, { items: object[] }>;
  collections: CollectionFixture[];
  presets: Record<string, { value: object }>;
  stopwords: Record<string, object>;
  aliases: Record<string, string>;
};

const datasetsDir = join(EVALS_ROOT, "datasets");

export function loadFixtures(): Fixtures {
  return JSON.parse(
    readFileSync(join(datasetsDir, "fixtures.json"), "utf8"),
  ) as Fixtures;
}

export function datasetDocumentCount(file: string): number {
  return readFileSync(join(datasetsDir, file), "utf8")
    .split("\n")
    .filter((line) => line.trim()).length;
}

type Named = { name?: string; id?: string };

async function listNames(
  ts: TypesenseHttp,
  path: string,
  key?: string,
): Promise<string[]> {
  const result = await ts.get<unknown>(path).catch(() => []);
  const rows = (
    key && result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)[key]
      : result
  ) as Named[] | undefined;
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row.name ?? row.id)
    .filter((value): value is string => typeof value === "string");
}

/** Removes everything a task could have created or changed. */
export async function resetCluster(ts: TypesenseHttp): Promise<void> {
  const enc = encodeURIComponent;
  for (const name of await listNames(ts, "/aliases", "aliases")) {
    await ts.request("DELETE", `/aliases/${enc(name)}`);
  }
  for (const name of await listNames(ts, "/collections")) {
    await ts.request("DELETE", `/collections/${enc(name)}`);
  }
  for (const name of await listNames(ts, "/synonym_sets")) {
    await ts.request("DELETE", `/synonym_sets/${enc(name)}`);
  }
  for (const name of await listNames(ts, "/curation_sets")) {
    await ts.request("DELETE", `/curation_sets/${enc(name)}`);
  }
  for (const name of await listNames(ts, "/presets", "presets")) {
    await ts.request("DELETE", `/presets/${enc(name)}`);
  }
  for (const name of await listNames(ts, "/stopwords", "stopwords")) {
    await ts.request("DELETE", `/stopwords/${enc(name)}`);
  }
  const keys = await ts
    .get<{ keys?: { id: number }[] }>("/keys")
    .catch(() => ({ keys: [] }));
  for (const key of keys.keys ?? []) {
    await ts.request("DELETE", `/keys/${key.id}`);
  }
  for (const name of await listNames(ts, "/analytics/rules")) {
    await ts.request("DELETE", `/analytics/rules/${enc(name)}`);
  }
}

/** Resets the cluster and seeds the committed fixtures. Verifies document counts. */
export async function resetAndSeed(ts: TypesenseHttp): Promise<void> {
  await resetCluster(ts);
  const fixtures = loadFixtures();
  const enc = encodeURIComponent;
  for (const [name, value] of Object.entries(fixtures.synonym_sets)) {
    await ts.request("PUT", `/synonym_sets/${enc(name)}`, value);
  }
  for (const [name, value] of Object.entries(fixtures.curation_sets)) {
    await ts.request("PUT", `/curation_sets/${enc(name)}`, value);
  }
  for (const collection of fixtures.collections) {
    const { documents, $comment: _comment, ...schema } = collection;
    await ts.request("POST", "/collections", schema);
    const jsonl = readFileSync(join(datasetsDir, documents), "utf8");
    const result = await ts.request<string | object>(
      "POST",
      `/collections/${enc(collection.name)}/documents/import`,
      jsonl,
      { action: "create" },
    );
    const lines =
      typeof result === "string"
        ? result.split("\n")
        : [JSON.stringify(result)];
    const failed = lines.filter((line) => !line.includes('"success":true'));
    if (failed.length > 0) {
      throw new Error(
        `Seeding ${collection.name} failed: ${failed.slice(0, 3).join(" | ")}`,
      );
    }
    const info = await ts.get<{ num_documents: number }>(
      `/collections/${enc(collection.name)}`,
    );
    const expected = datasetDocumentCount(documents);
    if (info.num_documents !== expected) {
      throw new Error(
        `Seeded ${info.num_documents}/${expected} documents into ${collection.name}`,
      );
    }
  }
  for (const [name, value] of Object.entries(fixtures.presets)) {
    await ts.request("PUT", `/presets/${enc(name)}`, value);
  }
  for (const [name, value] of Object.entries(fixtures.stopwords)) {
    await ts.request("PUT", `/stopwords/${enc(name)}`, value);
  }
  for (const [alias, collection] of Object.entries(fixtures.aliases)) {
    await ts.request("PUT", `/aliases/${enc(alias)}`, {
      collection_name: collection,
    });
  }
}
