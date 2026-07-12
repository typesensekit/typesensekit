import { describe, expect, it } from "vitest";
import { renderCompletion } from "./completion.js";

describe("shell completion", () => {
  it.each([
    "bash",
    "zsh",
    "fish",
  ] as const)("renders %s completion for operations and profiles", (shell) => {
    const output = renderCompletion(shell);
    expect(output).toContain("documents.search");
    expect(output).toContain("profile");
    expect(output).toContain("test");
  });
});
