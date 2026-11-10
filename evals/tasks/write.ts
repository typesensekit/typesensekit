/**
 * Write tasks. Run only in an interface's full-access mode. Graded by
 * inspecting cluster state with direct HTTP calls after the agent finishes;
 * checks are behavioral where possible (does the search now work?) so any
 * valid approach passes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Article,
  allOf,
  articles,
  fail,
  ok,
  type Product,
  products,
} from "../src/oracle.js";
import { EVALS_ROOT } from "../src/paths.js";
import type { StateTask } from "../src/types.js";
import type { TypesenseHttp } from "../src/typesense.js";

type WriteTask = Omit<StateTask, "kind" | "mode">;

function seedRows<T>(file: string): T[] {
  return readFileSync(join(EVALS_ROOT, "datasets", file), "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as T);
}

const docCount =
  (collection: string, expected: number) => async (ts: TypesenseHttp) => {
    const info = await ts.find<{ num_documents: number }>(
      `/collections/${collection}`,
    );
    if (!info) return fail(`${collection} no longer exists`);
    return info.num_documents === expected
      ? ok(`${collection} has ${expected} documents`)
      : fail(
          `${collection} has ${info.num_documents} documents, expected ${expected}`,
        );
  };

const writes: WriteTask[] = [
  {
    id: "write.couch-synonym",
    category: "write",
    difficulty: "medium",
    prompt:
      "Customers who search the products collection for couch get no results, but we sell plenty of sofas. Make couch and sofa interchangeable in product searches.",
    check: async (ts) => {
      const sofas = seedRows<Product>("products.jsonl").filter((p) =>
        /\bsofa\b/i.test(p.name),
      );
      const result = await ts.search("products", {
        q: "couch",
        query_by: "name",
        per_page: 100,
      });
      const ids = new Set(
        (result.hits ?? []).map((h) => String(h.document.id)),
      );
      const missing = sofas.filter((s) => !ids.has(s.id));
      if (missing.length > 0) {
        return fail(
          `"couch" found ${result.found} products; missing sofas ${missing.map((s) => s.id).join(", ")}`,
        );
      }
      return allOf([
        async () => ok(`"couch" finds all ${sofas.length} sofas`),
        () => docCount("products", 54)(ts),
      ]);
    },
    reference: async (ts) => {
      await ts.request("PUT", "/synonym_sets/furniture-synonyms/items/couch", {
        synonyms: ["couch", "sofa"],
      });
    },
  },
  {
    id: "write.create-alias",
    category: "write",
    difficulty: "easy",
    prompt:
      "Create an alias named store that points to the products collection.",
    check: async (ts) => {
      const alias = await ts.find<{ collection_name: string }>(
        "/aliases/store",
      );
      if (!alias) return fail("alias store does not exist");
      return alias.collection_name === "products"
        ? ok("store -> products")
        : fail(`store -> ${alias.collection_name}`);
    },
    reference: async (ts) => {
      await ts.request("PUT", "/aliases/store", {
        collection_name: "products",
      });
    },
  },
  {
    id: "write.update-price",
    category: "write",
    difficulty: "easy",
    prompt:
      "Change the price of the product with id p005 to 79.99. Leave every other field unchanged.",
    check: async (ts) => {
      const original = seedRows<Product>("products.jsonl").find(
        (p) => p.id === "p005",
      );
      const doc = await ts.find<Product>(
        "/collections/products/documents/p005",
      );
      if (!original || !doc) return fail("p005 is missing");
      if (Math.abs(doc.price - 79.99) > 1e-6)
        return fail(`price is ${doc.price}`);
      const changed = (Object.keys(original) as (keyof Product)[]).filter(
        (key) =>
          key !== "price" &&
          JSON.stringify(doc[key]) !== JSON.stringify(original[key]),
      );
      return changed.length === 0
        ? ok("price 79.99, other fields intact")
        : fail(`other fields changed: ${changed.join(", ")}`);
    },
    reference: async (ts) => {
      await ts.request("PATCH", "/collections/products/documents/p005", {
        price: 79.99,
      });
    },
  },
  {
    id: "write.fix-facet",
    category: "write",
    difficulty: "hard",
    prompt:
      "Make the category field of the support_articles collection facetable, without losing any documents or their category values.",
    check: async (ts) => {
      const seeded = seedRows<Article>("support_articles.jsonl");
      const expected = new Map<string, number>();
      for (const a of seeded)
        expected.set(a.category, (expected.get(a.category) ?? 0) + 1);
      let result: Awaited<ReturnType<TypesenseHttp["search"]>>;
      try {
        result = await ts.search("support_articles", {
          q: "*",
          facet_by: "category",
          per_page: 0,
          max_facet_values: 50,
        });
      } catch (error) {
        return fail(`faceting still fails: ${(error as Error).message}`);
      }
      const counts = result.facet_counts?.[0]?.counts ?? [];
      const wrong = [...expected].filter(
        ([value, count]) =>
          counts.find((c) => c.value === value)?.count !== count,
      );
      if (wrong.length > 0 || counts.length !== expected.size) {
        return fail(
          `category facet counts differ from the seed: ${JSON.stringify(counts)}`,
        );
      }
      const current = await articles(ts);
      return allOf([
        async () => ok("category facets match the seed"),
        async () =>
          current.length === seeded.length
            ? ok(`${seeded.length} articles kept`)
            : fail(`${current.length} articles, expected ${seeded.length}`),
      ]);
    },
    reference: async (ts) => {
      await ts.request("PATCH", "/collections/support_articles", {
        fields: [
          { name: "category", drop: true },
          { name: "category", type: "string", facet: true },
        ],
      });
    },
  },
  {
    id: "write.fix-preset",
    category: "write",
    difficulty: "medium",
    prompt:
      "The search preset support_search should also search article bodies, so that searching the support_articles collection for refund with this preset finds the refund articles. Fix the preset, and keep it searching titles as well.",
    check: async (ts) => {
      const preset = await ts.find<{ value: { query_by?: string } }>(
        "/presets/support_search",
      );
      if (!preset) return fail("preset support_search no longer exists");
      const fields = (preset.value.query_by ?? "")
        .split(",")
        .map((f) => f.trim());
      if (!fields.includes("title") || !fields.includes("body")) {
        return fail(`query_by is "${preset.value.query_by}"`);
      }
      const result = await ts.search("support_articles", {
        q: "refund",
        preset: "support_search",
        per_page: 0,
      });
      return result.found > 0
        ? ok(
            `preset query_by=${fields.join(",")} finds ${result.found} refund articles`,
          )
        : fail("preset still finds no refund articles");
    },
    reference: async (ts) => {
      await ts.request("PUT", "/presets/support_search", {
        value: { query_by: "title,body" },
      });
    },
  },
  {
    id: "write.delete-duplicate",
    category: "write",
    difficulty: "medium",
    prompt:
      "The books collection contains a duplicate: two documents share the same ISBN. Delete the copy with the higher id and keep the original.",
    check: async (ts) =>
      allOf([
        async () =>
          (await ts.find("/collections/books/documents/b050"))
            ? fail("duplicate b050 still exists")
            : ok("b050 deleted"),
        async () =>
          (await ts.find("/collections/books/documents/b012"))
            ? ok("original b012 kept")
            : fail("original b012 was deleted"),
        () => docCount("books", 49)(ts),
      ]),
    reference: async (ts) => {
      await ts.request("DELETE", "/collections/books/documents/b050");
    },
  },
  {
    id: "write.cheap-audio-preset",
    category: "write",
    difficulty: "medium",
    prompt:
      "Create a search preset named cheap_audio for the products collection that restricts results to the Audio category with a price under 100.",
    check: async (ts) => {
      if (!(await ts.find("/presets/cheap_audio"))) {
        return fail("preset cheap_audio does not exist");
      }
      const expected = (await products(ts))
        .filter((p) => p.category === "Audio" && p.price < 100)
        .map((p) => p.id)
        .sort();
      let found: string[];
      try {
        const result = await ts.search("products", {
          q: "*",
          preset: "cheap_audio",
          per_page: 100,
        });
        found = (result.hits ?? []).map((h) => String(h.document.id)).sort();
      } catch (error) {
        return fail(
          `searching with the preset fails: ${(error as Error).message}`,
        );
      }
      return JSON.stringify(found) === JSON.stringify(expected)
        ? ok(`preset returns exactly ${expected.join(", ")}`)
        : fail(
            `preset returns [${found.join(", ")}], expected [${expected.join(", ")}]`,
          );
    },
    reference: async (ts) => {
      await ts.request("PUT", "/presets/cheap_audio", {
        value: { filter_by: "category:=Audio && price:<100" },
      });
    },
  },
];

export const writeTasks: StateTask[] = writes.map((task) => ({
  ...task,
  kind: "state",
  mode: "full-access",
}));
