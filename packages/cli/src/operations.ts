import { operations } from "@typesensekit/core";
import { defineCommand } from "citty";
import { parseInput, render } from "./output.js";
import { resolveClient } from "./profile/resolve.js";

export function operationCommands() {
  return Object.fromEntries(
    operations.map((operation) => [
      operation.name,
      defineCommand({
        meta: { name: operation.name, description: operation.summary },
        args: {
          input: {
            type: "string",
            description: "JSON object matching this operation input schema",
          },
          profile: { type: "string", description: "Profile name" },
          config: { type: "string", description: "Profile config path" },
          json: { type: "boolean", description: "Print JSON" },
        },
        async run({ args }) {
          const client = await resolveClient({
            profile: args.profile,
            config: args.config,
          });
          const input = operation.input.parse(parseInput(args.input));
          const result = await operation.execute(client, input);
          console.log(render(result, args.json));
        },
      }),
    ]),
  );
}

export function listOperations(): string {
  return operations
    .map((operation) => `${operation.name}\t${operation.summary}`)
    .join("\n");
}
