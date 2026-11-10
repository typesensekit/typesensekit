/**
 * Read-only answer tasks. Run with every interface's read-only mode.
 * Prompts never name an interface, tool, or command.
 */
import {
  articles,
  books,
  list,
  nthMostCommon,
  number,
  products,
  set,
  text,
  uniqueMax,
  uniqueMin,
} from "../src/oracle.js";
import type { AnswerTask } from "../src/types.js";

type ReadTask = Omit<AnswerTask, "kind" | "mode">;

const discovery: ReadTask[] = [
  {
    id: "discovery.list-collections",
    category: "discovery",
    difficulty: "easy",
    prompt:
      "Which collections exist on this Typesense cluster? List their names.",
    expected: async (ts) =>
      set(
        (await ts.get<{ name: string }[]>("/collections")).map((c) => c.name),
      ),
    decoy: "products, books, catalog",
  },
  {
    id: "discovery.count-books",
    category: "discovery",
    difficulty: "easy",
    prompt: "How many documents does the books collection contain?",
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
      "Which fields in the products collection are facetable? List the field names.",
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
    id: "discovery.field-type",
    category: "discovery",
    difficulty: "easy",
    prompt:
      "What is the data type of the `pages` field in the books collection?",
    expected: text("int32"),
    decoy: "int64",
  },
  {
    id: "discovery.default-sorting-field",
    category: "discovery",
    difficulty: "medium",
    prompt:
      "Which field is the default sorting field of the products collection?",
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
    prompt: "How many products in the Audio category cost less than 100?",
    expected: async (ts) =>
      number(
        (await products(ts)).filter(
          (p) => p.category === "Audio" && p.price < 100,
        ).length,
      ),
    decoy: "12",
  },
  {
    id: "search.top-rated-book-by-author",
    category: "search",
    difficulty: "medium",
    prompt:
      "What is the title of the highest-rated book written by Corwin Hale?",
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
    prompt: 'What is the id of the product named "Linden Sectional Sofa"?',
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
      "List the titles of all Science Fiction books in the books collection that were published before 1950.",
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
      "What is the name of the cheapest in-stock product from the brand Halcyon?",
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
    decoy: "Harbor Chef Knife",
  },
  {
    id: "search.rating-price-window",
    category: "search",
    difficulty: "medium",
    prompt:
      "List the ids of all products with a rating of at least 4.5 and a price between 50 and 150 inclusive.",
    expected: async (ts) =>
      set(
        (await products(ts))
          .filter((p) => p.rating >= 4.5 && p.price >= 50 && p.price <= 150)
          .map((p) => p.id),
      ),
    decoy: "p025",
  },
  {
    id: "search.third-most-expensive-furniture",
    category: "search",
    difficulty: "medium",
    prompt:
      "What is the name of the third most expensive product in the Furniture category?",
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
    decoy: "Quill Coffee Table",
  },
  {
    id: "search.lighthouse-author",
    category: "search",
    difficulty: "easy",
    prompt:
      "Who wrote the book whose title contains the word Lighthouse and that was published in 1972?",
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
];

const facets: ReadTask[] = [
  {
    id: "facets.top-brand",
    category: "facets",
    difficulty: "easy",
    prompt: "Which brand has the most products in the products collection?",
    expected: async (ts) =>
      text(
        nthMostCommon(
          (await products(ts)).map((p) => p.brand),
          1,
          "top brand",
        ),
      ),
    decoy: "Halcyon",
  },
  {
    id: "facets.distinct-genres",
    category: "facets",
    difficulty: "easy",
    prompt: "How many distinct genres are there in the books collection?",
    expected: async (ts) =>
      number(new Set((await books(ts)).map((b) => b.genre)).size),
    decoy: "5",
  },
  {
    id: "facets.average-audio-price",
    category: "facets",
    difficulty: "medium",
    prompt:
      "What is the average price of products in the Audio category? Round to 2 decimal places.",
    expected: async (ts) => {
      const audio = (await products(ts)).filter((p) => p.category === "Audio");
      return number(
        Math.round(
          (audio.reduce((s, p) => s + p.price, 0) / audio.length) * 100,
        ) / 100,
        0.011,
      );
    },
    decoy: "300",
  },
  {
    id: "facets.max-pages-fantasy",
    category: "facets",
    difficulty: "medium",
    prompt: "What is the highest page count among Fantasy books?",
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
    prompt:
      "Which language has the second-highest number of books in the books collection?",
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
    prompt: "How many products are currently in stock?",
    expected: async (ts) =>
      number((await products(ts)).filter((p) => p.in_stock).length),
    decoy: "54",
  },
  {
    id: "facets.categories-over-10",
    category: "facets",
    difficulty: "medium",
    prompt:
      "Which product categories contain more than 10 products? List them.",
    expected: async (ts) => {
      const counts = new Map<string, number>();
      for (const p of await products(ts)) {
        counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      }
      return set([...counts].filter(([, count]) => count > 10).map(([c]) => c));
    },
    decoy: "Furniture, Audio, Office",
  },
];

const multiSearch: ReadTask[] = [
  {
    id: "multi.furniture-and-mystery",
    category: "multi-search",
    difficulty: "medium",
    prompt:
      "For a dashboard I need two numbers: how many products are in the Furniture category, and how many books are in the Mystery genre. Answer with the two counts in that order.",
    expected: async (ts) =>
      list([
        String(
          (await products(ts)).filter((p) => p.category === "Furniture").length,
        ),
        String((await books(ts)).filter((b) => b.genre === "Mystery").length),
      ]),
    decoy: "14, 5",
  },
  {
    id: "multi.most-expensive-and-longest",
    category: "multi-search",
    difficulty: "medium",
    prompt:
      "Give me the id of the most expensive product and the id of the book with the most pages, in that order.",
    expected: async (ts) =>
      list([
        uniqueMax(await products(ts), (p) => p.price, "most expensive").id,
        uniqueMax(await books(ts), (b) => b.pages, "most pages").id,
      ]),
    decoy: "p005, b029",
  },
  {
    id: "multi.harbor-in-both",
    category: "multi-search",
    difficulty: "hard",
    prompt:
      "Run a text search for the word harbor in both the products collection (product names and descriptions) and the books collection (book titles). How many documents match in each? Answer with the products count, then the books count.",
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
    id: "multi.top-kitchen-and-poetry",
    category: "multi-search",
    difficulty: "hard",
    prompt:
      "What is the highest-rated product in the Kitchen category and the highest-rated book in the Poetry genre? Answer with the product id, then the book id.",
    expected: async (ts) =>
      list([
        uniqueMax(
          (await products(ts)).filter((p) => p.category === "Kitchen"),
          (p) => p.rating,
          "top kitchen",
        ).id,
        uniqueMax(
          (await books(ts)).filter((b) => b.genre === "Poetry"),
          (b) => b.rating,
          "top poetry",
        ).id,
      ]),
    decoy: "p041, b008",
  },
];

const lookup: ReadTask[] = [
  {
    id: "lookup.price-by-id",
    category: "lookup",
    difficulty: "easy",
    prompt: "What is the price of the product with id p017?",
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
      "Who are the authors of the books with ids b003, b010, and b021? Answer in that order.",
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
    prompt: 'What is the ISBN of the book titled "The Copper Cartographer"?',
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
  {
    id: "lookup.tags-by-id",
    category: "lookup",
    difficulty: "easy",
    prompt: "Which tags does the product with id p004 have?",
    expected: async (ts) =>
      set(
        (
          await ts.get<{ tags: string[] }>(
            "/collections/products/documents/p004",
          )
        ).tags,
      ),
    decoy: "compact, wood",
  },
];

const ROOT_CAUSES =
  "Answer with exactly one of: field_missing, not_facetable, not_indexed, not_sortable, wrong_type.";

const debugging: ReadTask[] = [
  {
    id: "debug.facet-category",
    category: "debugging",
    difficulty: "medium",
    prompt: `Faceting the support_articles collection by its category field fails with an error. What is the root cause? ${ROOT_CAUSES}`,
    expected: text("not_facetable"),
    decoy: "field_missing",
  },
  {
    id: "debug.filter-product-area",
    category: "debugging",
    difficulty: "medium",
    prompt: `Filtering the support_articles collection by product_area (for example product_area:=payments) fails with an error. What is the root cause? ${ROOT_CAUSES}`,
    expected: text("not_indexed"),
    decoy: "not_facetable",
  },
  {
    id: "debug.sort-views",
    category: "debugging",
    difficulty: "medium",
    prompt: `Sorting the support_articles collection by views (views:desc) fails with an error. What is the root cause? ${ROOT_CAUSES}`,
    expected: text("not_sortable"),
    decoy: "field_missing",
  },
  {
    id: "debug.preset-refund",
    category: "debugging",
    difficulty: "hard",
    prompt:
      "Searching the support_articles collection for refund using the search preset support_search returns no results, although several articles discuss refunds. Which field must be added to the preset's query_by to fix this? Answer with the field name.",
    expected: async (ts) => {
      // Guard the premise: the preset finds nothing, the body field does.
      const viaPreset = await ts.search("support_articles", {
        q: "refund",
        preset: "support_search",
      });
      const viaBody = (await articles(ts)).filter((a) =>
        /refund/i.test(a.body),
      );
      if (viaPreset.found !== 0 || viaBody.length === 0) {
        throw new Error("preset-refund premise no longer holds");
      }
      return text("body");
    },
    decoy: "title",
  },
  {
    id: "debug.missing-synonym",
    category: "debugging",
    difficulty: "hard",
    prompt:
      "Users searching the support_articles collection for login get no results, although several articles explain how to sign in. A synonym is missing. Which synonym set is attached to this collection and should receive the fix? Answer with the synonym set name.",
    expected: async (ts) => {
      const info = await ts.get<{ synonym_sets?: string[] }>(
        "/collections/support_articles",
      );
      if (info.synonym_sets?.length !== 1)
        throw new Error("expected one linked set");
      return text(info.synonym_sets[0] ?? "");
    },
    decoy: "furniture-synonyms",
  },
  {
    id: "debug.hidden-product",
    category: "debugging",
    difficulty: "hard",
    prompt:
      'The in-stock product "Garnet Noise-Cancelling Headphones" never appears when customers search the products collection for headphones. What is the id of the rule responsible?',
    expected: text("hide-discontinued-headphones"),
    decoy: "promote-linden-sofa",
  },
];

const config: ReadTask[] = [
  {
    id: "config.alias-target",
    category: "config",
    difficulty: "easy",
    prompt: "Which collection does the alias catalog point to?",
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
    prompt:
      "How many synonym rules does the synonym set furniture-synonyms contain?",
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
      "Which fields does the search preset book_search search in (its query_by)? List them.",
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
    prompt:
      "Which synonym sets are attached to the products collection? List their names.",
    expected: async (ts) =>
      set(
        (await ts.get<{ synonym_sets?: string[] }>("/collections/products"))
          .synonym_sets ?? [],
      ),
    decoy: "furniture-synonyms, support-synonyms",
  },
  {
    id: "config.stopwords",
    category: "config",
    difficulty: "easy",
    prompt: "Which words are in the stopwords set common-words? List them.",
    expected: async (ts) =>
      set(
        (
          await ts.get<{ stopwords: { stopwords: string[] } }>(
            "/stopwords/common-words",
          )
        ).stopwords.stopwords,
      ),
    decoy: "the, a, an, of",
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
      "When someone searches the products collection for exactly sofa, which product id is pinned to the top by a curation rule?",
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
  ...debugging,
  ...config,
].map((task) => ({ ...task, kind: "answer", mode: "read-only" }));
