import { describe, expect, it, vi } from "vitest";
import { confirmAction, confirmDestructiveOperation } from "./confirmation.js";

describe("destructive confirmation", () => {
  it("does not prompt for safe operations", async () => {
    const ask = vi.fn();
    await confirmDestructiveOperation("documents.search", {}, false, {
      isTTY: false,
      ask,
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it("refuses non-interactive destructive calls without --yes", async () => {
    await expect(
      confirmDestructiveOperation("documents.delete", {}, false, {
        isTTY: false,
      }),
    ).rejects.toThrow("Pass --yes");
  });

  it("accepts yes and rejects the default answer", async () => {
    await expect(
      confirmAction("remove profile local", false, {
        isTTY: true,
        ask: async () => "yes",
      }),
    ).resolves.toBeUndefined();
    await expect(
      confirmAction("remove profile local", false, {
        isTTY: true,
        ask: async () => "",
      }),
    ).rejects.toThrow("Cancelled");
  });

  it("allows --yes to bypass all prompts", async () => {
    await expect(
      confirmDestructiveOperation("api.call", { method: "post" }, true, {
        isTTY: false,
      }),
    ).resolves.toBeUndefined();
  });
});
