/**
 * Read-only answer tasks. Run with every interface's read-only mode.
 *
 * Prompts are phrased the way a user would ask: "our catalog" (the `catalog`
 * alias → products), "the library" (`library` → books), "the help center"
 * (`help_center` → support_articles). They never name a tool or command,
 * and avoid naming fields where a user would not know them.
 *
 * Trap tasks (marked TRAP) have a plausible-looking wrong answer that falls
 * out of Typesense defaults: 10 hits per page, 10 facet values, synonyms,
 * curation pins, or unescaped filter values.
 */
import {
  type Book,
  books,
  list,
  nthMostCommon,
  number,
  type Product,
  products,
  set,
  text,
  uniqueMax,
  uniqueMin,
} from "../src/oracle.js";
import type { AnswerTask } from "../src/types.js";

type ReadTask = Omit<AnswerTask, "kind" | "mode">;

const hasWord = (value: string, word: string) =>
  new RegExp(`\\b${word}\\b`, "i").test(value);

const discovery: ReadTask[] = [
  {
    id: "discovery.list-collections",
    category: "discovery",
    difficulty: "easy",
    prompt:
      "What collections exist on our search cluster? List their names (not aliases).",
    expected: async (ts) =>
      set(
        (await ts.get<{ name: string }[]>("/collections")).map((c) => c.name),
      ),
    decoy: "catalog, library, help_center",
  },
  {
    id: "discovery.count-books",
    category: "discovery",
    difficulty: "easy",
    prompt: "How many books are in the library?",
    expected: async (ts) =>
      number(
        (await ts.get<{ num_documents: number }>("/collections/books"))
          .num_documents,
      ),
    decoy: "49",
  },
  {
    id: "discovery.facetable-fields",
    category: "discovery",
    difficulty: "medium",
    prompt:
      "Which product attributes in our catalog can be used as facets? List the field names.",
    expected: async (ts) =>
      set(
        (
          await ts.get<{ fields: { name: string; facet: boolean }[] }>(
            "/collections/products",
          )
        ).fields
          .filter((f) => f.facet)
          .map((f) => f.name),
      ),
    decoy: "brand, category",
  },
  {
    id: "discovery.default-sorting-field",
    category: "discovery",
    difficulty: "medium",
    prompt:
      "When someone browses our catalog without choosing a sort order, which field are results ordered by? Give the field name.",
    expected: async (ts) =>
      text(
        (
          await ts.get<{ default_sorting_field: string }>(
            "/collections/products",
          )
        ).default_sorting_field,
      ),
    decoy: "rating",
  },
];

const search: ReadTask[] = [
  {
    id: "search.audio-under-100",
    category: "search",
    difficulty: "easy",
    prompt: "How many audio products in our catalog cost less than $100?",
    expected: async (ts) =>
      number(
        (await products(ts)).filter(
          (p) => p.category === "Audio" && p.price < 100,
        ).length,
      ),
    decoy: "10",
  },
  {
    id: "search.top-rated-book-by-author",
    category: "search",
    difficulty: "medium",
    prompt: "What's the highest-rated book by Corwin Hale in the library?",
    expected: async (ts) =>
      text(
        uniqueMax(
          (await books(ts)).filter((b) => b.author === "Corwin Hale"),
          (b) => b.rating,
          "top Corwin Hale book",
        ).title,
      ),
    decoy: "A Northern Comet",
  },
  {
    id: "search.find-by-name",
    category: "search",
    difficulty: "easy",
    prompt: "What's the product id of the Linden Sectional Sofa?",
    expected: async (ts) => {
      const match = (await products(ts)).filter(
        (p) => p.name === "Linden Sectional Sofa",
      );
      if (match.length !== 1)
        throw new Error("expected one Linden Sectional Sofa");
      return text(match[0]?.id ?? "");
    },
    decoy: "p002",
  },
  {
    id: "search.old-science-fiction",
    category: "search",
    difficulty: "medium",
    prompt:
      "Which science fiction books in the library were published before 1950? List the titles.",
    expected: async (ts) =>
      set(
        (await books(ts))
          .filter((b) => b.genre === "Science Fiction" && b.year < 1950)
          .map((b) => b.title),
      ),
    decoy: "A Crimson Archive",
  },
  {
    id: "search.cheapest-in-stock-brand",
    category: "search",
    difficulty: "medium",
    prompt:
      "What's the cheapest Halcyon product we currently have in stock? Give its name.",
    expected: async (ts) =>
      text(
        uniqueMin(
          (await products(ts)).filter(
            (p) => p.brand === "Halcyon" && p.in_stock,
          ),
          (p) => p.price,
          "cheapest in-stock Halcyon",
        ).name,
      ),
    decoy: "Sable Espresso Grinder",
  },
  {
    id: "search.third-most-expensive-furniture",
    category: "search",
    difficulty: "medium",
    prompt:
      "What's the third most expensive piece of furniture we sell? Give its name.",
    expected: async (ts) => {
      const sorted = (await products(ts))
        .filter((p) => p.category === "Furniture")
        .sort((a, b) => b.price - a.price);
      if (
        sorted[2]?.price === sorted[3]?.price ||
        sorted[1]?.price === sorted[2]?.price
      ) {
        throw new Error("price tie around rank 3");
      }
      return text(sorted[2]?.name ?? "");
    },
    decoy: "Dune Ottoman",
  },
  {
    id: "search.lighthouse-author",
    category: "search",
    difficulty: "easy",
    prompt:
      "Who wrote the book in the library that has Lighthouse in its title and came out in 1972?",
    expected: async (ts) => {
      const match = (await books(ts)).filter(
        (b) => b.title.includes("Lighthouse") && b.year === 1972,
      );
      if (match.length !== 1)
        throw new Error("expected one 1972 Lighthouse book");
      return text(match[0]?.author ?? "");
    },
    decoy: "Anouk Delacroix",
  },
  {
    // TRAP: a curation rule pins p010 to the top of "sofa" searches, even
    // when sorting by price.
    id: "search.cheapest-sofa",
    category: "search",
    difficulty: "hard",
    prompt: "What's the cheapest sofa we sell? Give its product id.",
    expected: async (ts) =>
      text(
        uniqueMin(
          (await products(ts)).filter((p) => hasWord(p.name, "sofa")),
          (p) => p.price,
          "cheapest sofa",
        ).id,
      ),
    decoy: "p010",
  },
  {
    // TRAP: the catalog's synonym set maps lamp <-> light, so a plain
    // search for "lamp" also counts lights.
    id: "search.lamp-name-count",
    category: "search",
    difficulty: "hard",
    prompt:
      "How many products in our catalog have the word lamp in their name? Lights and LED strips don't count.",
    expected: async (ts) =>
      number(
        (await products(ts)).filter((p) => hasWord(p.name, "lamp")).length,
      ),
    decoy: "0",
  },
  {
    // TRAP: more than 10 matches, so the default page size truncates.
    id: "search.list-many-ids",
    category: "search",
    difficulty: "hard",
    prompt:
      "List the product ids of every in-stock Lumen lighting product that costs under $100.",
    expected: async (ts) => {
      const ids = (await products(ts))
        .filter(
          (p) =>
            p.brand === "Lumen" &&
            p.category === "Lighting" &&
            p.in_stock &&
            p.price < 100,
        )
        .map((p) => p.id);
      if (ids.length <= 10 || ids.length > 60) {
        throw new Error(`premise: want 11-60 matches, got ${ids.length}`);
      }
      return set(ids);
    },
    decoy: "p029",
  },
  {
    // TRAP: "Fox & Finch" must be quoted in filter_by, and the brand is too
    // small to appear among the default 10 facet values.
    id: "search.fox-and-finch-in-stock",
    category: "search",
    difficulty: "hard",
    prompt: "How many in-stock products does the brand Fox & Finch have?",
    expected: async (ts) =>
      number(
        (await products(ts)).filter(
          (p) => p.brand === "Fox & Finch" && p.in_stock,
        ).length,
      ),
    decoy: "12",
  },
];

const facets: ReadTask[] = [
  {
    id: "facets.top-brand",
    category: "facets",
    difficulty: "easy",
    prompt: "Which brand has the most products in our catalog?",
    expected: async (ts) =>
      text(
        nthMostCommon(
          (await products(ts)).map((p) => p.brand),
          1,
          "top brand",
        ),
      ),
    decoy: "Northwind",
  },
  {
    // TRAP: the smallest brands are outside the default 10 facet values.
    id: "facets.fewest-products-brand",
    category: "facets",
    difficulty: "hard",
    prompt: "Which brand has the fewest products in our catalog?",
    expected: async (ts) => {
      const counts = new Map<string, number>();
      for (const p of await products(ts)) {
        counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
      }
      const ranked = [...counts].sort((a, b) => a[1] - b[1]);
      if (ranked[0]?.[1] === ranked[1]?.[1]) throw new Error("tie for fewest");
      return text(ranked[0]?.[0] ?? "");
    },
    decoy: "Tundra",
  },
  {
    id: "facets.average-audio-price",
    category: "facets",
    difficulty: "medium",
    prompt:
      "What's the average price of our audio products? Round to 2 decimal places.",
    expected: async (ts) => {
      const audio = (await products(ts)).filter((p) => p.category === "Audio");
      return number(
        Math.round(
          (audio.reduce((s, p) => s + p.price, 0) / audio.length) * 100,
        ) / 100,
        0.011,
      );
    },
    decoy: "328.62",
  },
  {
    id: "facets.office-price-sum",
    category: "facets",
    difficulty: "hard",
    prompt:
      "What's the combined price of all Office products released in 2022 or 2023? Round to 2 decimal places.",
    expected: async (ts) =>
      number(
        Math.round(
          (await products(ts))
            .filter(
              (p) =>
                p.category === "Office" &&
                (p.release_year === 2022 || p.release_year === 2023),
            )
            .reduce((s, p) => s + p.price, 0) * 100,
        ) / 100,
        0.05,
      ),
    decoy: "0",
  },
  {
    id: "facets.max-pages-fantasy",
    category: "facets",
    difficulty: "medium",
    prompt: "How many pages does the longest fantasy book in the library have?",
    expected: async (ts) =>
      number(
        Math.max(
          ...(await books(ts))
            .filter((b) => b.genre === "Fantasy")
            .map((b) => b.pages),
        ),
      ),
    decoy: "796",
  },
  {
    id: "facets.second-language",
    category: "facets",
    difficulty: "medium",
    prompt: "Which language has the second-most books in the library?",
    expected: async (ts) =>
      text(
        nthMostCommon(
          (await books(ts)).map((b) => b.language),
          2,
          "language #2",
        ),
      ),
    decoy: "English",
  },
  {
    id: "facets.in-stock-count",
    category: "facets",
    difficulty: "easy",
    prompt: "How many products do we have in stock right now?",
    expected: async (ts) =>
      number((await products(ts)).filter((p) => p.in_stock).length),
    decoy: "38",
  },
  {
    id: "facets.big-categories",
    category: "facets",
    difficulty: "medium",
    prompt: "Which product categories have more than 600 products? List them.",
    expected: async (ts) => {
      const counts = new Map<string, number>();
      for (const p of await products(ts)) {
        counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      }
      return set([...counts].filter(([, n]) => n > 600).map(([c]) => c));
    },
    decoy: "Furniture, Audio",
  },
  {
    id: "facets.most-reviewed-per-category",
    category: "facets",
    difficulty: "hard",
    prompt:
      "For each product category, which product has the most reviews? Give the product ids ordered by category name alphabetically.",
    expected: async (ts) => {
      const all = await products(ts);
      const categories = [...new Set(all.map((p) => p.category))].sort();
      return list(
        categories.map(
          (category) =>
            uniqueMax(
              all.filter((p) => p.category === category),
              (p) => p.num_reviews,
              `most reviewed ${category}`,
            ).id,
        ),
      );
    },
    decoy: "p007",
  },
];

const multiSearch: ReadTask[] = [
  {
    id: "multi.most-expensive-and-longest",
    category: "multi-search",
    difficulty: "medium",
    prompt:
      "What's the id of our most expensive product, and the id of the longest book in the library? In that order.",
    expected: async (ts) =>
      list([
        uniqueMax(await products(ts), (p: Product) => p.price, "most expensive")
          .id,
        uniqueMax(await books(ts), (b: Book) => b.pages, "most pages").id,
      ]),
    decoy: "p011, b029",
  },
  {
    id: "multi.harbor-in-both",
    category: "multi-search",
    difficulty: "hard",
    prompt:
      "If someone searches for harbor, how many matching products do they get (searching product names and descriptions) and how many matching books (searching titles)? Products count first.",
    expected: async (ts) => {
      const [p, b] = await Promise.all([
        ts.search("products", {
          q: "harbor",
          query_by: "name,description",
          per_page: 0,
        }),
        ts.search("books", { q: "harbor", query_by: "title", per_page: 0 }),
      ]);
      return list([String(p.found), String(b.found)]);
    },
    decoy: "5, 2",
  },
  {
    id: "multi.most-reviewed-kitchen-and-best-poetry",
    category: "multi-search",
    difficulty: "hard",
    prompt:
      "Give me the id of our most-reviewed kitchen product and the id of the best-rated poetry book in the library, in that order.",
    expected: async (ts) =>
      list([
        uniqueMax(
          (await products(ts)).filter((p) => p.category === "Kitchen"),
          (p) => p.num_reviews,
          "most reviewed kitchen",
        ).id,
        uniqueMax(
          (await books(ts)).filter((b) => b.genre === "Poetry"),
          (b) => b.rating,
          "top poetry",
        ).id,
      ]),
    decoy: "p041, b024",
  },
];

const lookup: ReadTask[] = [
  {
    id: "lookup.price-by-id",
    category: "lookup",
    difficulty: "easy",
    prompt: "How much does product p017 cost?",
    expected: async (ts) =>
      number(
        (
          await ts.get<{ price: number }>(
            "/collections/products/documents/p017",
          )
        ).price,
        0.001,
      ),
    decoy: "34",
  },
  {
    id: "lookup.authors-by-ids",
    category: "lookup",
    difficulty: "easy",
    prompt:
      "Who wrote library books b003, b010, and b021? Answer in that order.",
    expected: async (ts) => {
      const all = await books(ts);
      return list(
        ["b003", "b010", "b021"].map(
          (id) => all.find((b) => b.id === id)?.author ?? "",
        ),
      );
    },
    decoy: "Priya Ostrander, Priya Ostrander, Tobias Venn, Corwin Hale",
  },
  {
    id: "lookup.isbn-by-title",
    category: "lookup",
    difficulty: "medium",
    prompt: 'What is the ISBN of "The Copper Cartographer"?',
    expected: async (ts) => {
      const match = (await books(ts)).filter(
        (b) => b.title === "The Copper Cartographer",
      );
      if (match.length !== 1)
        throw new Error("expected one Copper Cartographer");
      return text(match[0]?.isbn ?? "");
    },
    decoy: "978-0-11507-077-2",
  },
];

const config: ReadTask[] = [
  {
    id: "config.alias-target",
    category: "config",
    difficulty: "easy",
    prompt: "Which collection actually backs our catalog?",
    expected: async (ts) =>
      text(
        (await ts.get<{ collection_name: string }>("/aliases/catalog"))
          .collection_name,
      ),
    decoy: "catalog",
  },
  {
    id: "config.synonym-count",
    category: "config",
    difficulty: "easy",
    prompt: "How many synonym rules are in the furniture-synonyms set?",
    expected: async (ts) =>
      number(
        (await ts.get<{ items: unknown[] }>("/synonym_sets/furniture-synonyms"))
          .items.length,
      ),
    decoy: "2",
  },
  {
    id: "config.preset-query-by",
    category: "config",
    difficulty: "medium",
    prompt:
      "Which fields does the saved search book_search look in? List them.",
    expected: async (ts) =>
      set(
        (
          await ts.get<{ value: { query_by: string } }>("/presets/book_search")
        ).value.query_by.split(","),
      ),
    decoy: "title",
  },
  {
    id: "config.linked-synonym-sets",
    category: "config",
    difficulty: "medium",
    prompt: "Which synonym sets apply to searches in our catalog?",
    expected: async (ts) =>
      set(
        (await ts.get<{ synonym_sets?: string[] }>("/collections/products"))
          .synonym_sets ?? [],
      ),
    decoy: "furniture-synonyms, support-synonyms",
  },
  {
    id: "config.all-aliases",
    category: "config",
    difficulty: "medium",
    prompt:
      "List every alias on the cluster with the collection it points to, formatted as alias=collection.",
    expected: async (ts) =>
      set(
        (
          await ts.get<{
            aliases: { name: string; collection_name: string }[];
          }>("/aliases")
        ).aliases.map((a) => `${a.name}=${a.collection_name}`),
      ),
    decoy: "catalog=products, library=books",
  },
  {
    id: "config.pinned-for-sofa",
    category: "config",
    difficulty: "medium",
    prompt:
      "When someone searches our catalog for exactly sofa, which product id gets pinned to the top?",
    expected: text("p010"),
    decoy: "p001",
  },
];

export const readTasks: AnswerTask[] = [
  ...discovery,
  ...search,
  ...facets,
  ...multiSearch,
  ...lookup,
  ...config,
].map((task) => ({ ...task, kind: "answer", mode: "read-only" }));
