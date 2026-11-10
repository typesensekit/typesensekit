import { expect, it } from "vitest";
import {
  aliasesByCollection,
  fieldsHint,
  renderCollectionsCompact,
} from "./collection-summary.js";

const collection = {
  name: "products",
  num_documents: 3,
  default_sorting_field: "rating",
  synonym_sets: ["product-synonyms"],
  curation_sets: [],
  created_at: 1,
  fields: [
    { name: "title", type: "string", facet: false, sort: false, index: true },
    { name: "brand", type: "string", facet: true, optional: true },
    { name: "price", type: "float", facet: false, sort: true },
    { name: "notes", type: "string", index: false, optional: true },
  ],
};

it("renders a short text overview with aliases and field flags", () => {
  const aliases = aliasesByCollection({
    aliases: [{ name: "catalog", collection_name: "products" }],
  });
  expect(renderCollectionsCompact([collection], aliases, false)).toBe(
    [
      "products: 3 documents | aliases: catalog | default_sorting_field: rating | synonym_sets: product-synonyms",
      "  title: string",
      "  brand: string [facet, optional]",
      "  price: float [sort]",
      "  notes: string [index:false, optional]",
      "Flags: facet = usable in facet_by; sort = usable in sort_by; index:false = cannot be searched, filtered, faceted or sorted; optional = may be missing. Any indexed field can be filtered.",
    ].join("\n"),
  );
});

it("renders compact JSON for a single collection or a list", () => {
  const single = JSON.parse(
    renderCollectionsCompact(collection, new Map(), true),
  );
  expect(single).toMatchObject({
    name: "products",
    num_documents: 3,
    default_sorting_field: "rating",
    synonym_sets: ["product-synonyms"],
  });
  expect(single).not.toHaveProperty("created_at");
  expect(single).not.toHaveProperty("curation_sets");
  expect(single.fields[1]).toEqual({
    name: "brand",
    type: "string",
    facet: true,
    optional: true,
  });
  expect(
    JSON.parse(renderCollectionsCompact([collection], new Map(), true)),
  ).toHaveLength(1);
});

it("lists fields and query_by candidates for field errors", () => {
  expect(fieldsHint(collection)).toBe(
    [
      "Fields of products: title (string), brand (string, facet), price (float, sort), notes (string, index:false).",
      "Text fields for query_by: title,brand,notes.",
    ].join("\n"),
  );
});

it("redacts credentials in compact output, JSON and text", () => {
  const schema = {
    name: "docs",
    num_documents: 1,
    fields: [
      {
        name: "embedding",
        type: "float[]",
        embed: {
          from: ["title"],
          model_config: { model_name: "openai/x", api_key: "sk-secret-123" },
        },
      },
    ],
  };
  const aliases = new Map<string, string[]>();
  expect(renderCollectionsCompact([schema], aliases, true)).not.toContain(
    "sk-secret-123",
  );
  expect(renderCollectionsCompact([schema], aliases, false)).not.toContain(
    "sk-secret-123",
  );
});

it("prints core's already-compact collections envelope unchanged", () => {
  const envelope = {
    collections: [{ name: "docs", fields: ["title: string"] }],
  };
  expect(
    JSON.parse(renderCollectionsCompact(envelope, new Map(), true)),
  ).toEqual(envelope);
});
