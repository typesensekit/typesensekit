import { createInterface } from "node:readline/promises";
import { isDestructiveOperation } from "@typesensekit/core";

type ConfirmationDependencies = {
  isTTY?: boolean;
  ask?: (question: string) => Promise<string>;
};

async function askInTerminal(question: string): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

export async function confirmAction(
  action: string,
  yes = false,
  dependencies: ConfirmationDependencies = {},
): Promise<void> {
  if (yes) return;
  const isTTY =
    dependencies.isTTY ?? Boolean(process.stdin.isTTY && process.stderr.isTTY);
  if (!isTTY) {
    throw new Error(`Refusing to ${action} without confirmation. Pass --yes.`);
  }
  const answer = await (dependencies.ask ?? askInTerminal)(
    `Confirm ${action}? [y/N] `,
  );
  if (!/^(?:y|yes)$/i.test(answer.trim())) {
    throw new Error(`Cancelled: ${action}`);
  }
}

export async function confirmDestructiveOperation(
  name: string,
  input: Record<string, unknown>,
  yes = false,
  dependencies: ConfirmationDependencies = {},
): Promise<void> {
  if (!isDestructiveOperation(name, input)) return;
  await confirmAction(`run destructive operation ${name}`, yes, dependencies);
}
