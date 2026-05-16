import { defineCommand, runMain } from "citty";
import { listOperations, operationCommands } from "./operations.js";
import { profileCommand } from "./profile/commands.js";
import { renderSkill, type SkillTarget } from "./skills.js";

export const main = defineCommand({
  meta: {
    name: "typesensekit",
    version: "0.0.0",
    description: "CLI for Typesense Admin API operations",
  },
  subCommands: {
    profile: profileCommand,
    operations: defineCommand({
      meta: {
        name: "operations",
        description: "List available operation commands",
      },
      run() {
        console.log(listOperations());
      },
    }),
    skills: defineCommand({
      meta: {
        name: "skills",
        description: "Print MCP and agent skill snippets",
      },
      args: {
        target: {
          type: "positional",
          default: "mcp",
          description: "mcp | claude-desktop | claude-code | hermes",
        },
      },
      run({ args }) {
        console.log(renderSkill(args.target as SkillTarget));
      },
    }),
    ...operationCommands(),
  },
});

runMain(main);
