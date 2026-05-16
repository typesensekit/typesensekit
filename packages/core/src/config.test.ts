import { describe, expect, it } from "vitest";
import { serverConfigSchema } from "./config.js";

it("validates the minimal server config", () => {
  expect(
    serverConfigSchema.parse({ url: "http://localhost:8108", apiKey: "xyz" }),
  ).toEqual({
    url: "http://localhost:8108",
    apiKey: "xyz",
  });
});

describe("serverConfigSchema", () => {
  it("rejects an empty api key", () => {
    expect(() =>
      serverConfigSchema.parse({ url: "http://localhost:8108", apiKey: "" }),
    ).toThrow();
  });
});
