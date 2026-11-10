import { afterEach, expect, it, vi } from "vitest";
import { clusterOverview } from "./cluster-overview.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("summarizes the configured cluster's collections", async () => {
  vi.stubEnv("TYPESENSE_URL", "http://typesense.test:8108");
  vi.stubEnv("TYPESENSE_API_KEY", "key");
  vi.stubEnv("TSK_NO_OVERVIEW", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL) =>
      Response.json(
        url.pathname === "/aliases"
          ? { aliases: [{ name: "catalog", collection_name: "products" }] }
          : [
              {
                name: "products",
                num_documents: 2,
                fields: [{ name: "brand", type: "string", facet: true }],
              },
            ],
      ),
    ),
  );
  const overview = await clusterOverview();
  expect(overview).toContain("products: 2 documents | aliases: catalog");
  expect(overview).toContain("  brand: string [facet]");
});

it("stays silent when the cluster cannot be reached or is disabled", async () => {
  vi.stubEnv("TYPESENSE_URL", "http://typesense.test:8108");
  vi.stubEnv("TYPESENSE_API_KEY", "key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }),
  );
  expect(await clusterOverview()).toBeUndefined();
  vi.stubEnv("TSK_NO_OVERVIEW", "1");
  expect(await clusterOverview()).toBeUndefined();
});
