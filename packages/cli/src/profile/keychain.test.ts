import { afterEach, expect, it, vi } from "vitest";
import { saveKeychainApiKey } from "./credentials.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (command: string, args: string[], callback: (error: Error) => void) => {
      callback(new Error(`Command failed: ${command} ${args.join(" ")}`));
    },
  ),
}));

afterEach(() => vi.unstubAllGlobals());

it("does not expose the API key when the Keychain command fails", async () => {
  vi.stubGlobal("process", { ...process, platform: "darwin" });
  const error = await saveKeychainApiKey("test", "fake-sensitive-key").catch(
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(Error);
  expect(String(error)).toBe(
    "Error: Could not save API key to the macOS Keychain",
  );
  expect(error).not.toHaveProperty("cause");
});
