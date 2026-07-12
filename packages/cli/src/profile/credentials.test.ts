import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readApiKeyFromStdin } from "./credentials.js";

afterEach(() => vi.restoreAllMocks());

describe("secure credential input", () => {
  it("reads and trims an API key from stdin", async () => {
    vi.stubGlobal("process", {
      ...process,
      stdin: Readable.from(["secret-key\n"]),
    });
    await expect(readApiKeyFromStdin()).resolves.toBe("secret-key");
  });

  it("rejects empty stdin", async () => {
    vi.stubGlobal("process", { ...process, stdin: Readable.from(["\n"]) });
    await expect(readApiKeyFromStdin()).rejects.toThrow("No API key");
  });
});
