export type SkillTarget = "claude-desktop" | "claude-code" | "hermes" | "mcp";

export function renderSkill(target: SkillTarget): string {
  const base = `{
  "mcpServers": {
    "typesensekit": {
      "command": "npx",
      "args": ["-y", "@typesensekit/mcp"],
      "env": {
        "TYPESENSE_URL": "https://your-cluster.typesense.net",
        "TYPESENSE_API_KEY": "your-admin-api-key"
      }
    }
  }
}`;

  if (target === "mcp") return base;
  if (target === "claude-desktop") {
    return `Add this to Claude Desktop's MCP config:\n\n${base}`;
  }
  if (target === "claude-code") {
    return `claude mcp add typesensekit -- npx -y @typesensekit/mcp\n\nThen set TYPESENSE_URL and TYPESENSE_API_KEY in your shell or MCP environment.`;
  }
  return `---\nname: typesensekit\ndescription: Use @typesensekit/mcp to inspect and manage Typesense clusters.\n---\n\n# TypesenseKit\n\nUse the typesensekit MCP server when the task involves Typesense collections, documents, search, aliases, synonyms, overrides, API keys, analytics, presets, stopwords, conversations, metrics, stats, or health checks.\n\nInstall:\n\n\`\`\`sh\nnpm install -g @typesensekit/mcp\n\`\`\`\n\nMCP config:\n\n\`\`\`json\n${base}\n\`\`\``;
}
