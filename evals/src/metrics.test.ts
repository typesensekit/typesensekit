import { describe, expect, it } from "vitest";
import type { CliInterfaceConfig, McpInterfaceConfig } from "./interfaces.js";
import {
  analyzeTranscript,
  classifyError,
  opsForCall,
  type TranscriptMessage,
} from "./metrics.js";

const mcp: McpInterfaceConfig = {
  name: "test-mcp",
  kind: "mcp",
  server: { type: "stdio", command: "node" },
  modes: { "read-only": {} },
  toolGroups: [["search", "documents.search"]],
};

const cli: CliInterfaceConfig = {
  name: "test-cli",
  kind: "cli",
  commands: { tsk: { command: "node" } },
  allowedCommands: ["tsk", "jq"],
  modes: { "read-only": {} },
  opPattern: "^tsk\\s+([A-Za-z0-9_.-]+)",
  discoveryPattern: "(--help|--schema|--examples|^tsk\\s+operations\\b)",
  toolGroups: [["search", "documents.search"]],
};

const use = (id: string, name: string, input: unknown): TranscriptMessage => ({
  type: "assistant",
  parent_tool_use_id: null,
  message: { content: [{ type: "tool_use", id, name, input }] },
});
const result = (
  id: string,
  text: string,
  isError = false,
): TranscriptMessage => ({
  type: "user",
  parent_tool_use_id: null,
  message: {
    content: [
      {
        type: "tool_result",
        tool_use_id: id,
        is_error: isError,
        content: [{ type: "text", text }],
      },
    ],
  },
});

describe("classifyError", () => {
  it("classifies common error texts", () => {
    expect(classifyError('Blocked by sandbox: "curl" is not available.')).toBe(
      "denied",
    );
    expect(
      classifyError(
        "MCP error -32602: Input validation error: Invalid arguments",
      ),
    ).toBe("invalid_args");
    expect(
      classifyError(
        "Typesense 404: Could not find a facet field named `category`",
      ),
    ).toBe("typesense");
    expect(classifyError("Unknown command documents.find")).toBe(
      "unknown_tool",
    );
    expect(
      classifyError(
        "Collection-level synonyms are unavailable for products. Use synonym_sets.list",
      ),
    ).toBe("unknown_tool");
    expect(
      classifyError("Exit code 1\nCLI for Typesense Admin API operations"),
    ).toBe("other");
    expect(classifyError("something odd")).toBe("other");
  });

  it("checks interface-specific patterns first", () => {
    expect(
      classifyError("E_BAD_QUERY", {
        errorPatterns: { invalid_args: "E_BAD_QUERY" },
      }),
    ).toBe("invalid_args");
  });
});

describe("opsForCall", () => {
  it("strips the MCP prefix", () => {
    expect(opsForCall("mcp__typesense__documents_search", {}, mcp)).toEqual({
      ops: ["documents_search"],
      unknownOps: [],
      discovery: false,
    });
  });

  it("canonicalizes dotted names the same way on both arms", () => {
    expect(opsForCall("mcp__typesense__documents.search", {}, mcp).ops).toEqual(
      ["documents_search"],
    );
    expect(
      opsForCall("Bash", { command: "tsk documents.search --input '{}'" }, cli)
        .ops,
    ).toEqual(["documents_search"]);
  });

  it("extracts CLI ops and recognizes discovery", () => {
    expect(
      opsForCall(
        "Bash",
        { command: "tsk search --input '{}' | jq . && tsk health" },
        cli,
      ),
    ).toEqual({ ops: ["search", "health"], unknownOps: [], discovery: false });
    expect(opsForCall("Bash", { command: "tsk search --schema" }, cli)).toEqual(
      {
        ops: [],
        unknownOps: [],
        discovery: true,
      },
    );
    expect(opsForCall("Bash", { command: "jq --version" }, cli)).toEqual({
      ops: [],
      unknownOps: [],
      discovery: false,
    });
  });

  it("flags guessed CLI ops that do not exist, even in help calls", () => {
    const known = {
      ...cli,
      validOps: ["collections.retrieve", "documents.search"],
      builtinCommands: ["operations"],
    };
    expect(
      opsForCall(
        "Bash",
        { command: "tsk collection get books | jq . && tsk operations" },
        known,
      ),
    ).toEqual({
      ops: [],
      unknownOps: ["collection"],
      discovery: false,
    });
    expect(opsForCall("Bash", { command: "tsk alias --help" }, known)).toEqual({
      ops: [],
      unknownOps: ["alias"],
      discovery: true,
    });
  });
});

describe("analyzeTranscript", () => {
  it("counts errors, duplicates, and alternate tool mixes", () => {
    const messages = [
      use("1", "mcp__typesense__search", {
        collection: "books",
        params: { q: "x" },
      }),
      result("1", "Typesense 400: Missing query_by", true),
      use("2", "mcp__typesense__documents_search", {
        params: { q: "x", query_by: "title" },
        collection: "books",
      }),
      result("2", '{"found":1}'),
      use("3", "mcp__typesense__documents_search", {
        collection: "books",
        params: { query_by: "title", q: "x" },
      }),
      result("3", '{"found":1}'),
      { type: "result", subtype: "success" },
    ];
    const analysis = analyzeTranscript(messages, mcp);
    expect(analysis.calls).toHaveLength(3);
    expect(analysis.errorsByKind.typesense).toBe(1);
    expect(analysis.duplicateCalls).toBe(1);
    expect(analysis.alternateToolMixes).toBe(1);
    expect(analysis.opsUsed).toEqual({ search: 1, documents_search: 2 });
  });

  it("classifies errors from nonexistent CLI ops as wrong-tool", () => {
    const known = { ...cli, validOps: ["collections.retrieve"] };
    const analysis = analyzeTranscript(
      [
        use("1", "Bash", { command: "tsk collection get books" }),
        result(
          "1",
          "Exit code 1\nCLI for Typesense Admin API operations",
          true,
        ),
      ],
      known,
    );
    expect(analysis.unknownOpCalls).toBe(1);
    expect(analysis.errorsByKind.unknown_tool).toBe(1);
    expect(analysis.opsUsed).toEqual({});
  });

  it("resolves space-separated CLI ops and ignores accepted guesses", () => {
    const known = {
      ...cli,
      validOps: ["collections.list", "collections.retrieve"],
    };
    expect(
      opsForCall("Bash", { command: "tsk collections list --json" }, known),
    ).toEqual({ ops: ["collections_list"], unknownOps: [], discovery: false });
    const analysis = analyzeTranscript(
      [
        use("1", "Bash", { command: "tsk collections --help" }),
        result("1", "collections operations: ..."),
      ],
      known,
    );
    expect(analysis.unknownOpCalls).toBe(0);
  });

  it("ignores subagent messages", () => {
    const sub = {
      ...use("9", "mcp__typesense__health", {}),
      parent_tool_use_id: "x",
    };
    expect(analyzeTranscript([sub], mcp).calls).toHaveLength(0);
  });
});
