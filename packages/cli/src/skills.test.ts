import { describe, expect, it } from "vitest";
import { renderSkill } from "./skills.js";

describe("skills", () => {
  it("prints MCP config snippets", () => {
    expect(renderSkill("mcp")).toContain("@typesensekit/mcp");
    expect(renderSkill("hermes")).toContain("name: typesensekit");
  });
});
