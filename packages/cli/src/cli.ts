import { defineCommand } from "citty";
import packageJson from "../package.json" with { type: "json" };
import { clusterOverview } from "./cluster-overview.js";
import { type CompletionShell, renderCompletion } from "./completion.js";
import { dispatch } from "./dispatch.js";
import { listOperations, operationCommands } from "./operations.js";
import { profileCommand } from "./profile/commands.js";
import { renderSkill, type SkillTarget } from "./skills.js";

export const main = defineCommand({
  meta: {
    name: "typesensekit",
    version: packageJson.version,
    description: "CLI for Typesense Admin API operations",
  },
  subCommands: {
    profile: profileCommand,
    operations: defineCommand({
      meta: {
        name: "operations",
        description: "List available operation commands",
      },
      async run() {
        const overview = await clusterOverview();
        console.log(listOperations(overview));
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
    completion: defineCommand({
      meta: {
        name: "completion",
        description: "Print shell completion for bash, zsh, or fish",
      },
      args: {
        shell: {
          type: "positional",
          required: true,
          description: "bash | zsh | fish",
        },
      },
      run({ args }) {
        if (!(["bash", "zsh", "fish"] as string[]).includes(args.shell)) {
          throw new Error(`Unsupported shell: ${args.shell}`);
        }
        console.log(renderCompletion(args.shell as CompletionShell));
      },
    }),
    ...operationCommands(),
  },
});

await dispatch(main, process.argv.slice(2), packageJson.version);
