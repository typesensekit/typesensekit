/**
 * Deterministically regenerates the committed JSONL datasets.
 *
 *   pnpm --filter @typesensekit/evals exec tsx scripts/generate-datasets.ts
 *
 * All names, authors, and titles are fictional so an agent cannot answer
 * from memory and has to query the cluster. Task expectations are computed
 * from the live cluster by oracles (see src/tasks), so regenerating data does
 * not silently break answers; `pnpm eval --dry-run` re-validates every task.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "../datasets");

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261110);
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)] as T;
const between = (min: number, max: number) => min + rand() * (max - min);
const round = (value: number, digits: number) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const pad = (n: number, width: number) => String(n).padStart(width, "0");

function writeJsonl(name: string, rows: object[]) {
  writeFileSync(
    join(out, name),
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  );
}

// ---------------------------------------------------------------- products
const brands = [
  "Acme",
  "Northwind",
  "Lumen",
  "Halcyon",
  "Brightway",
  "Oakridge",
] as const;
const catalog: Record<
  string,
  { kinds: string[]; price: [number, number]; tags: string[] }
> = {
  Furniture: {
    kinds: [
      "3-Seat Sofa",
      "Sectional Sofa",
      "Sleeper Sofa",
      "Armchair",
      "Coffee Table",
      "Bookshelf",
      "Dining Chair",
      "Ottoman",
    ],
    price: [80, 1400],
    tags: ["living-room", "wood", "upholstered", "modular", "compact"],
  },
  Audio: {
    kinds: [
      "Wireless Headphones",
      "Noise-Cancelling Headphones",
      "Bookshelf Speaker",
      "Soundbar",
      "Earbuds",
      "Turntable",
    ],
    price: [25, 600],
    tags: ["wireless", "bluetooth", "hi-fi", "portable", "noise-cancelling"],
  },
  Lighting: {
    kinds: ["Floor Lamp", "Desk Lamp", "Pendant Light", "LED Strip"],
    price: [15, 320],
    tags: ["dimmable", "smart", "warm-white", "energy-saving"],
  },
  Kitchen: {
    kinds: ["Chef Knife", "Dutch Oven", "Espresso Grinder", "Kettle"],
    price: [20, 450],
    tags: ["stainless", "cast-iron", "electric", "dishwasher-safe"],
  },
  Office: {
    kinds: [
      "Standing Desk",
      "Ergonomic Chair",
      "Monitor Arm",
      "Desk Organizer",
    ],
    price: [18, 900],
    tags: ["ergonomic", "adjustable", "compact", "wood"],
  },
};
const modelNames = [
  "Linden",
  "Aster",
  "Briar",
  "Cobalt",
  "Dune",
  "Ember",
  "Fjord",
  "Garnet",
  "Harbor",
  "Iris",
  "Juniper",
  "Kestrel",
  "Larch",
  "Meridian",
  "Nimbus",
  "Orchid",
  "Pallas",
  "Quill",
  "Rowan",
  "Sable",
];
const descriptions: Record<string, string[]> = {
  Furniture: [
    "Solid frame with soft-touch fabric, built for everyday lounging.",
    "Clean mid-century lines with tapered legs.",
    "Easy assembly and a durable finish for busy homes.",
  ],
  Audio: [
    "Rich, balanced sound with long battery life.",
    "Crisp detail and deep bass in a compact design.",
    "Low-latency connection for music and calls.",
  ],
  Lighting: [
    "Soft ambient glow that suits reading corners.",
    "Adjustable brightness with a minimalist profile.",
  ],
  Kitchen: [
    "Restaurant-grade build for daily cooking.",
    "Precise control and easy cleanup.",
  ],
  Office: [
    "Keeps your workspace tidy and comfortable.",
    "Sturdy construction designed for long workdays.",
  ],
};

const products: object[] = [];
const usedNames = new Set<string>();
let productIndex = 0;
const perCategory: Record<string, number> = {
  Furniture: 14,
  Audio: 12,
  Lighting: 9,
  Kitchen: 9,
  Office: 10,
};
for (const [category, count] of Object.entries(perCategory)) {
  const spec = catalog[category];
  if (!spec) throw new Error(category);
  for (let i = 0; i < count; i++) {
    let name = "";
    do {
      name = `${pick(modelNames)} ${spec.kinds[i % spec.kinds.length]}`;
    } while (usedNames.has(name));
    usedNames.add(name);
    productIndex++;
    const tagCount = 1 + Math.floor(rand() * 3);
    const tags = [
      ...new Set(Array.from({ length: tagCount }, () => pick(spec.tags))),
    ].sort();
    products.push({
      id: `p${pad(productIndex, 3)}`,
      name,
      description: pick(descriptions[category] ?? [""]),
      brand: pick(brands),
      category,
      // Two decimals, never x.x5 ties; deterministic.
      price: round(between(spec.price[0], spec.price[1]), 2),
      rating: round(between(2.5, 5), 1),
      in_stock: rand() > 0.25,
      tags,
      release_year: 2018 + Math.floor(rand() * 8),
      num_reviews: Math.floor(between(0, 2500)),
    });
  }
}
writeJsonl("products.jsonl", products);

// ------------------------------------------------------------------- books
const authors = [
  "Mara Quell",
  "Tobias Venn",
  "Ilse Marrow",
  "Dario Fenwick",
  "Priya Ostrander",
  "Hollis Crane",
  "Junie Albright",
  "Corwin Hale",
  "Selene Varga",
  "Anouk Delacroix",
];
const genres = [
  "Science Fiction",
  "Fantasy",
  "Mystery",
  "History",
  "Poetry",
  "Romance",
];
const languages = [
  "English",
  "English",
  "English",
  "Spanish",
  "French",
  "German",
];
const adjectives = [
  "Silent",
  "Copper",
  "Hollow",
  "Last",
  "Northern",
  "Glass",
  "Wandering",
  "Burning",
  "Quiet",
  "Distant",
  "Crimson",
  "Paper",
];
const nouns = [
  "Lighthouse",
  "Orchard",
  "Cartographer",
  "Tide",
  "Engine",
  "Archive",
  "Garden",
  "Comet",
  "Harbor",
  "Clockmaker",
  "Meridian",
  "Lantern",
  "Atlas",
];
const books: Record<string, unknown>[] = [];
const usedTitles = new Set<string>();
for (let i = 1; i <= 49; i++) {
  let title = "";
  do {
    const pattern = Math.floor(rand() * 3);
    const adj = pick(adjectives);
    const noun = pick(nouns);
    title =
      pattern === 0
        ? `The ${adj} ${noun}`
        : pattern === 1
          ? `${noun} of the ${adj} Sea`
          : `A ${adj} ${noun}`;
  } while (usedTitles.has(title));
  usedTitles.add(title);
  books.push({
    id: `b${pad(i, 3)}`,
    title,
    author: pick(authors),
    genre: pick(genres),
    year: 1921 + Math.floor(rand() * 104),
    pages: 120 + Math.floor(rand() * 680),
    rating: round(between(2.8, 4.9), 2),
    language: pick(languages),
    isbn: `978-0-${pad(10000 + i * 137, 5)}-${pad(i * 7, 3)}-${i % 10}`,
  });
}
// A deliberate duplicate entry (same ISBN as b012) for a cleanup write task.
const original = books[11];
if (!original) throw new Error("missing b012");
books.push({ ...original, id: "b050" });
writeJsonl("books.jsonl", books);

// --------------------------------------------------------- support_articles
// Deliberately misconfigured collection (see support_articles.schema.json):
// - category is not facetable
// - product_area is not indexed (cannot be filtered)
// - views is not sortable
// - the "support_search" preset only queries `title`, but refund wording
//   ("refund") only appears in `body`
// - the linked synonym set has no login <-> sign in mapping and the word
//   "login" never appears in the corpus.
const articles = [
  [
    "Getting your money back",
    "How to request a refund for an order within 30 days.",
    "Billing",
    "payments",
  ],
  [
    "How long reimbursements take",
    "Most refund requests are processed in 5 to 7 business days.",
    "Billing",
    "payments",
  ],
  [
    "Returning a damaged item",
    "Start a return and choose refund or replacement.",
    "Orders",
    "returns",
  ],
  [
    "Partial money back on bundles",
    "Bundles qualify for a partial refund per item.",
    "Billing",
    "payments",
  ],
  [
    "Cancelling before shipment",
    "Orders cancelled before shipment get an automatic refund.",
    "Orders",
    "orders",
  ],
  [
    "How to sign in to your account",
    "Use your email address and password to sign in.",
    "Account",
    "identity",
  ],
  [
    "Trouble signing in",
    "If you cannot sign in, reset your password from the sign in page.",
    "Account",
    "identity",
  ],
  [
    "Sign in with a passkey",
    "Passkeys let you sign in without a password.",
    "Account",
    "identity",
  ],
  [
    "Two-step verification",
    "Add a second step when you sign in from a new device.",
    "Account",
    "security",
  ],
  [
    "Changing your email address",
    "Update the email you use for notifications.",
    "Account",
    "identity",
  ],
  [
    "Tracking your shipment",
    "Find the tracking link in your shipping confirmation email.",
    "Shipping",
    "logistics",
  ],
  [
    "Shipping to a PO box",
    "Some carriers cannot deliver to PO boxes.",
    "Shipping",
    "logistics",
  ],
  [
    "International shipping rates",
    "Rates depend on destination and package weight.",
    "Shipping",
    "logistics",
  ],
  [
    "Express shipping cut-off times",
    "Order before 2pm for same-day dispatch.",
    "Shipping",
    "logistics",
  ],
  [
    "Downloading an invoice",
    "Invoices are available from the orders page.",
    "Billing",
    "payments",
  ],
  [
    "Updating a payment method",
    "Add or remove cards from your wallet.",
    "Billing",
    "payments",
  ],
  [
    "Gift cards and store credit",
    "Store credit never expires and can be combined with cards.",
    "Billing",
    "payments",
  ],
  [
    "Assembling a sofa frame",
    "Attach the legs before fixing the back cushions.",
    "Products",
    "furniture",
  ],
  [
    "Pairing wireless headphones",
    "Hold the power button for five seconds to enter pairing mode.",
    "Products",
    "audio",
  ],
  [
    "Cleaning a cast-iron dutch oven",
    "Avoid soap and dry immediately after rinsing.",
    "Products",
    "kitchen",
  ],
  [
    "Warranty coverage",
    "Most products include a two year limited warranty.",
    "Orders",
    "returns",
  ],
  [
    "Deleting your account",
    "Account deletion is permanent after 14 days.",
    "Account",
    "privacy",
  ],
  [
    "Exporting your data",
    "Request a copy of your personal data from settings.",
    "Account",
    "privacy",
  ],
  [
    "Contacting support",
    "Chat support is available every day from 8am to 8pm.",
    "General",
    "support",
  ],
] as const;
writeJsonl(
  "support_articles.jsonl",
  articles.map(([title, body, category, product_area], i) => ({
    id: `a${pad(i + 1, 2)}`,
    title,
    body,
    category,
    product_area,
    views: Math.floor(between(40, 9000)),
    published: i % 7 !== 6,
  })),
);

console.log(
  `wrote ${products.length} products, ${books.length} books, ${articles.length} support articles`,
);
