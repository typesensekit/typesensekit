/**
 * Write tasks. Run only in an interface's full-access mode. Graded by
 * inspecting cluster state with direct HTTP calls after the agent finishes;
 * checks are behavioral where possible (does the search now work?) so any
 * valid approach passes.
 */
import { allOf, type Book, fail, ok, type Product } from "../src/oracle.js";
import type { StateTask } from "../src/types.js";
import {
  allHitIds,
  attempt,
  docCount,
  sameDocuments,
  seedRows,
} from "./helpers.js";

type WriteTask = Omit<StateTask, "kind" | "mode">;

const seedProducts = () => seedRows<Product>("products.jsonl");
const seedBooks = () => seedRows<Book>("books.jsonl");

const writes: WriteTask[] = [
  {
    id: "write.couch-synonym",
    category: "write",
    difficulty: "medium",
    prompt:
      "Customers who search our catalog for couch get no results, but we sell lots of sofas. Make couch and sofa interchangeable in catalog searches.",
    check: async (ts) => {
      const sofas = seedProducts().filter((p) => /\bsofa\b/i.test(p.name));
      return attempt("searching for couch fails", async () => {
        const result = await ts.search("products", {
          q: "couch",
          query_by: "name",
          per_page: 50,
        });
        if (result.found < sofas.length) {
          return fail(
            `"couch" finds ${result.found} products, expected at least ${sofas.length} sofas`,
          );
        }
        const nonSofa = (result.hits ?? []).filter(
          (h) => !/\bsofa\b/i.test(String(h.document.name)),
        );
        if (nonSofa.length > 0) {
          return fail(
            `"couch" returns non-sofas, e.g. ${nonSofa[0]?.document.name}`,
          );
        }
        return allOf([
          async () => ok(`"couch" finds ${result.found} sofas`),
          () => docCount(ts, "products", seedProducts().length),
        ]);
      });
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
      "Set up store as another name for our catalog, so searches against store hit the same products.",
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
      "Change the price of product p005 to 79.99 and leave everything else about it unchanged.",
    check: async (ts) => {
      const original = seedProducts().find((p) => p.id === "p005");
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
    id: "write.delete-duplicate",
    category: "write",
    difficulty: "medium",
    prompt:
      "The library lists one book twice (same ISBN). Delete the copy with the higher id and keep the original.",
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
        () => docCount(ts, "books", seedBooks().length - 1),
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
      "Create a saved search named cheap_audio for our catalog that only returns audio products under $100.",
    check: async (ts) => {
      if (!(await ts.find("/presets/cheap_audio"))) {
        return fail("preset cheap_audio does not exist");
      }
      const expected = new Set(
        seedProducts()
          .filter((p) => p.category === "Audio" && p.price < 100)
          .map((p) => p.id),
      );
      return attempt("searching with the preset fails", async () => {
        const { found, ids } = await allHitIds(ts, "products", {
          q: "*",
          preset: "cheap_audio",
        });
        const extra = ids.filter((id) => !expected.has(id));
        if (found !== expected.size || extra.length > 0) {
          return fail(
            `preset returns ${found} products (${extra.length} outside Audio < $100), expected ${expected.size}`,
          );
        }
        return ok(
          `preset returns exactly the ${expected.size} audio products under $100`,
        );
      });
    },
    reference: async (ts) => {
      await ts.request("PUT", "/presets/cheap_audio", {
        value: { filter_by: "category:=Audio && price:<100" },
      });
    },
  },
  {
    id: "write.reindex-books",
    category: "write",
    difficulty: "hard",
    prompt:
      "We want to sort the library by title, but title isn't sortable. Create a new collection books_v2 with every book and a sortable title, then switch the library over to it. Keep the old books collection around for rollback.",
    check: async (ts) => {
      return attempt("books_v2 check fails", () =>
        allOf([
          async () => {
            const alias = await ts.find<{ collection_name: string }>(
              "/aliases/library",
            );
            return alias?.collection_name === "books_v2"
              ? ok("library -> books_v2")
              : fail(`library -> ${alias?.collection_name ?? "(missing)"}`);
          },
          () => sameDocuments(ts, "books_v2", seedBooks()),
          async () => {
            await ts.search("books_v2", {
              q: "*",
              sort_by: "title:asc",
              per_page: 1,
            });
            return ok("books_v2 sorts by title");
          },
          // The rollback copy must be intact too.
          () => sameDocuments(ts, "books", seedBooks()),
        ]),
      );
    },
    // A copy with every id but the contents lost must not pass.
    decoy: async (ts) => {
      await ts.request("POST", "/collections", {
        name: "books_v2",
        fields: [{ name: "title", type: "string", sort: true }],
      });
      const jsonl = seedBooks()
        .map((b) => JSON.stringify({ id: b.id, title: "DATA LOST" }))
        .join("\n");
      await ts.request(
        "POST",
        "/collections/books_v2/documents/import",
        jsonl,
        {
          action: "create",
        },
      );
      await ts.request("PUT", "/aliases/library", {
        collection_name: "books_v2",
      });
    },
    reference: async (ts) => {
      const schema = await ts.get<{
        fields: Record<string, unknown>[];
        default_sorting_field?: string;
      }>("/collections/books");
      await ts.request("POST", "/collections", {
        name: "books_v2",
        fields: schema.fields.map((field) =>
          field.name === "title" ? { ...field, sort: true } : field,
        ),
        default_sorting_field: schema.default_sorting_field,
      });
      const jsonl = await ts.get<string>("/collections/books/documents/export");
      await ts.request(
        "POST",
        "/collections/books_v2/documents/import",
        jsonl,
        {
          action: "create",
        },
      );
      await ts.request("PUT", "/aliases/library", {
        collection_name: "books_v2",
      });
    },
  },
  {
    id: "write.scoped-search-key",
    category: "write",
    difficulty: "medium",
    prompt:
      "Create an API key for our storefront that can only search the products collection and do nothing else.",
    check: async (ts) => {
      const { keys } = await ts.get<{
        keys: { actions: string[]; collections: string[] }[];
      }>("/keys");
      const scoped = keys.find(
        (key) =>
          key.actions.length > 0 &&
          key.actions.every((a) => a === "documents:search") &&
          key.collections.includes("products") &&
          key.collections.every((c) => c === "products" || c === "catalog"),
      );
      return scoped
        ? ok("a documents:search key scoped to products exists")
        : fail(
            `no key limited to documents:search on products; keys: ${JSON.stringify(
              keys.map((k) => ({
                actions: k.actions,
                collections: k.collections,
              })),
            )}`,
          );
    },
    reference: async (ts) => {
      await ts.request("POST", "/keys", {
        description: "storefront search",
        actions: ["documents:search"],
        collections: ["products"],
      });
    },
  },
  {
    id: "write.bulk-delete",
    category: "write",
    difficulty: "hard",
    prompt:
      "Remove every out-of-stock Halcyon kitchen product from our catalog. Don't touch anything else.",
    check: async (ts) => {
      const seeded = seedProducts();
      const targets = seeded.filter(
        (p) => p.brand === "Halcyon" && p.category === "Kitchen" && !p.in_stock,
      );
      return attempt("bulk-delete check fails", () =>
        allOf([
          async () => {
            const result = await ts.search("products", {
              q: "*",
              filter_by:
                "brand:=Halcyon && category:=Kitchen && in_stock:=false",
              per_page: 0,
            });
            return result.found === 0
              ? ok(
                  `all ${targets.length} out-of-stock Halcyon kitchen products removed`,
                )
              : fail(
                  `${result.found} out-of-stock Halcyon kitchen products remain`,
                );
          },
          () => docCount(ts, "products", seeded.length - targets.length),
        ]),
      );
    },
    reference: async (ts) => {
      await ts.request("DELETE", "/collections/products/documents", undefined, {
        filter_by: "brand:=Halcyon && category:=Kitchen && in_stock:=false",
      });
    },
  },
];

export const writeTasks: StateTask[] = writes.map((task) => ({
  ...task,
  kind: "state",
  mode: "full-access",
}));
