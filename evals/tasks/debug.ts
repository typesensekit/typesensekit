/**
 * Debugging tasks: a symptom report, no hints about the cause, and the
 * agent must actually fix it. Graded on cluster state (does the broken
 * request work now, with no data lost?), so any valid fix passes. Full
 * access, since fixing requires writes.
 */
import { type Article, allOf, fail, ok } from "../src/oracle.js";
import type { StateTask } from "../src/types.js";
import { allHitIds, attempt, docCount, seedRows } from "./helpers.js";

type DebugTask = Omit<StateTask, "kind" | "mode">;

const seedArticles = () => seedRows<Article>("support_articles.jsonl");
const PRODUCT_COUNT = () => seedRows("products.jsonl").length;

const debugTasks_: DebugTask[] = [
  {
    id: "debug.fix-category-facet",
    category: "debugging",
    difficulty: "hard",
    prompt:
      "Our help-center dashboard shows how many articles each category has, but that request has started failing. Fix the help center so it works again, without losing any articles or their categories.",
    check: async (ts) => {
      const seeded = seedArticles();
      const expected = new Map<string, number>();
      for (const a of seeded) {
        expected.set(a.category, (expected.get(a.category) ?? 0) + 1);
      }
      return attempt("faceting by category still fails", async () => {
        const result = await ts.search("support_articles", {
          q: "*",
          facet_by: "category",
          per_page: 0,
          max_facet_values: 50,
        });
        const counts = result.facet_counts?.[0]?.counts ?? [];
        const wrong = [...expected].filter(
          ([value, count]) =>
            counts.find((c) => c.value === value)?.count !== count,
        );
        if (wrong.length > 0 || counts.length !== expected.size) {
          return fail(
            `category counts differ from the seed: ${JSON.stringify(counts)}`,
          );
        }
        return allOf([
          async () => ok("category facet counts match the seed"),
          () => docCount(ts, "support_articles", seeded.length),
        ]);
      });
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
    id: "debug.fix-product-area-filter",
    category: "debugging",
    difficulty: "hard",
    prompt:
      "Support agents can't narrow help-center articles down to one product area (for example, only the payments articles); the filter errors out. Fix it without losing any data.",
    check: async (ts) => {
      const seeded = seedArticles();
      return attempt("filtering by product_area still fails", async () => {
        for (const area of ["payments", "identity"]) {
          const want = seeded.filter((a) => a.product_area === area).length;
          const result = await ts.search("support_articles", {
            q: "*",
            filter_by: `product_area:=${area}`,
            per_page: 0,
          });
          if (result.found !== want) {
            return fail(
              `product_area:=${area} finds ${result.found}, expected ${want}`,
            );
          }
        }
        return allOf([
          async () => ok("product_area filters match the seed"),
          () => docCount(ts, "support_articles", seeded.length),
        ]);
      });
    },
    reference: async (ts) => {
      await ts.request("PATCH", "/collections/support_articles", {
        fields: [
          { name: "product_area", drop: true },
          { name: "product_area", type: "string", optional: true },
        ],
      });
    },
  },
  {
    id: "debug.fix-views-sort",
    category: "debugging",
    difficulty: "hard",
    prompt:
      "Sorting help-center articles by most viewed fails. Fix it without losing any data.",
    check: async (ts) => {
      const seeded = seedArticles();
      const top = [...seeded].sort((a, b) => b.views - a.views)[0];
      return attempt("sorting by views still fails", async () => {
        const result = await ts.search("support_articles", {
          q: "*",
          sort_by: "views:desc",
          per_page: 1,
        });
        const first = result.hits?.[0]?.document;
        if (first?.id !== top?.id || first?.views !== top?.views) {
          return fail(
            `views:desc starts with ${JSON.stringify(first)}, expected ${top?.id}`,
          );
        }
        return allOf([
          async () => ok(`views:desc starts with ${top?.id}`),
          () => docCount(ts, "support_articles", seeded.length),
        ]);
      });
    },
    reference: async (ts) => {
      await ts.request("PATCH", "/collections/support_articles", {
        fields: [
          { name: "views", drop: true },
          { name: "views", type: "int32", sort: true },
        ],
      });
    },
  },
  {
    id: "debug.fix-refund-search",
    category: "debugging",
    difficulty: "medium",
    prompt:
      "Support agents use the saved search support_search. Searching for refund with it returns nothing, even though we have several refund articles. Fix the saved search so it finds them, and keep it matching titles too.",
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
      return attempt("searching with the preset fails", async () => {
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
      });
    },
    reference: async (ts) => {
      await ts.request("PUT", "/presets/support_search", {
        value: { query_by: "title,body" },
      });
    },
  },
  {
    id: "debug.fix-login-search",
    category: "debugging",
    difficulty: "hard",
    prompt:
      "People searching the help center for login get no results, even though we have several articles about signing in. Fix it.",
    check: async (ts) => {
      const want = seedArticles()
        .filter((a) => /\bsign in\b/i.test(`${a.title} ${a.body}`))
        .map((a) => a.id);
      return attempt("searching for login fails", async () => {
        const { ids } = await allHitIds(ts, "support_articles", {
          q: "login",
          query_by: "title,body",
        });
        const missing = want.filter((id) => !ids.includes(id));
        return missing.length === 0
          ? ok(`"login" finds all ${want.length} sign-in articles`)
          : fail(`"login" misses sign-in articles ${missing.join(", ")}`);
      });
    },
    reference: async (ts) => {
      await ts.request("PUT", "/synonym_sets/support-synonyms/items/login", {
        synonyms: ["login", "sign in"],
      });
    },
  },
  {
    id: "debug.unhide-product",
    category: "debugging",
    difficulty: "hard",
    prompt:
      "The Garnet Noise-Cancelling Headphones never show up when customers search our catalog for headphones, even though they're in stock. Make them show up, without changing how other searches behave.",
    check: async (ts) =>
      attempt("checking the headphones search fails", () =>
        allOf([
          async () => {
            const result = await ts.search("products", {
              q: "headphones",
              query_by: "name",
              filter_by: "id:=p016",
              per_page: 1,
            });
            return result.found === 1
              ? ok('p016 appears for "headphones"')
              : fail('p016 still does not appear for "headphones"');
          },
          async () => {
            const result = await ts.search("products", {
              q: "sofa",
              query_by: "name",
              per_page: 1,
            });
            const first = result.hits?.[0]?.document.id;
            return first === "p010"
              ? ok('the "sofa" pin still works')
              : fail(`the "sofa" pin was broken (first hit ${first})`);
          },
          () => docCount(ts, "products", PRODUCT_COUNT()),
        ]),
      ),
    reference: async (ts) => {
      await ts.request(
        "DELETE",
        "/curation_sets/product-curations/items/hide-discontinued-headphones",
      );
    },
  },
];

export const debugTasks: StateTask[] = debugTasks_.map((task) => ({
  ...task,
  kind: "state",
  mode: "full-access",
}));
