import { describe, expect, it, vi } from "vitest";
import { stopwordsOperations } from "./stopwords.js";

function operation(name: string) {
  const value = stopwordsOperations.find(
    (candidate) => candidate.name === name,
  );
  if (!value) throw new Error(`Missing operation: ${name}`);
  return value;
}

function client() {
  return {
    apiCall: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe("stopword operations", () => {
  it("lists global stopword sets", async () => {
    const typesense = client();
    await operation("stopwords.list").execute(typesense as never, {});
    expect(typesense.apiCall.get).toHaveBeenCalledWith("/stopwords");
  });

  it("creates a global stopword set", async () => {
    const typesense = client();
    await operation("stopwords.create").execute(typesense as never, {
      name: "common words",
      value: { stopwords: ["a", "the"] },
    });
    expect(typesense.apiCall.put).toHaveBeenCalledWith(
      "/stopwords/common%20words",
      { stopwords: ["a", "the"] },
    );
  });

  it("retrieves a global stopword set", async () => {
    const typesense = client();
    await operation("stopwords.retrieve").execute(typesense as never, {
      name: "common words",
    });
    expect(typesense.apiCall.get).toHaveBeenCalledWith(
      "/stopwords/common%20words",
    );
  });

  it("deletes a global stopword set", async () => {
    const typesense = client();
    await operation("stopwords.delete").execute(typesense as never, {
      name: "common words",
    });
    expect(typesense.apiCall.delete).toHaveBeenCalledWith(
      "/stopwords/common%20words",
    );
  });
});
