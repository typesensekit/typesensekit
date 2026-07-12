import { execFile as execFileCallback } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
export const KEYCHAIN_SERVICE = "typesensekit";

export async function readApiKeyFromStdin(): Promise<string> {
  let value = "";
  for await (const chunk of process.stdin) value += String(chunk);
  const key = value.trim();
  if (!key) throw new Error("No API key was provided on stdin");
  return key;
}

export async function promptForApiKey(): Promise<string> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error(
      "Cannot prompt for an API key without a TTY. Use --api-key-stdin or TYPESENSE_API_KEY.",
    );
  }

  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stderr.write(chunk);
      callback();
    },
  });
  const readline = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  process.stderr.write("Typesense API key: ");
  muted = true;
  try {
    const key = (await readline.question("")).trim();
    process.stderr.write("\n");
    if (!key) throw new Error("API key cannot be empty");
    return key;
  } finally {
    readline.close();
  }
}

function requireMacOS(): void {
  if (process.platform !== "darwin") {
    throw new Error(
      "OS keychain profiles are currently supported on macOS only",
    );
  }
}

export async function saveKeychainApiKey(
  account: string,
  apiKey: string,
): Promise<void> {
  requireMacOS();
  await execFile("security", [
    "add-generic-password",
    "-U",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    account,
    "-w",
    apiKey,
  ]);
}

export async function loadKeychainApiKey(account: string): Promise<string> {
  requireMacOS();
  try {
    const { stdout } = await execFile("security", [
      "find-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      account,
      "-w",
    ]);
    const key = stdout.trim();
    if (!key) throw new Error("empty keychain value");
    return key;
  } catch (error) {
    throw new Error(
      `Could not read API key for profile ${account} from the macOS Keychain`,
      { cause: error },
    );
  }
}
