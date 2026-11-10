import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { TypesenseHttp } from "./typesense.js";

const exec = promisify(execFile);

export const DEFAULT_IMAGE = "typesense/typesense:30.2";

export type Cluster = {
  ts: TypesenseHttp;
  /** Container name, or undefined for an external cluster. */
  container?: string;
  stop: () => Promise<void>;
};

const running = new Set<string>();

async function removeContainer(name: string) {
  running.delete(name);
  await exec("docker", ["rm", "-f", name]).catch(() => undefined);
}

let cleanupInstalled = false;
function installCleanup() {
  if (cleanupInstalled) return;
  cleanupInstalled = true;
  const cleanup = () => {
    for (const name of running) {
      // Best effort, synchronous enough for signal handlers.
      execFile("docker", ["rm", "-f", name], () => undefined);
    }
  };
  process.once("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
}

export async function dockerAvailable(): Promise<string | undefined> {
  try {
    const { stdout } = await exec("docker", [
      "info",
      "--format",
      "{{.ServerVersion}}",
    ]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Starts a disposable, in-memory-ish Typesense container on a random localhost port. */
export async function startCluster(
  image = DEFAULT_IMAGE,
  label = "eval",
): Promise<Cluster> {
  installCleanup();
  const apiKey = `eval-${randomBytes(12).toString("hex")}`;
  const name = `tsk-${label}-${randomBytes(4).toString("hex")}`;
  await exec("docker", [
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    "--label",
    "typesensekit-evals=1",
    "-p",
    "127.0.0.1::8108",
    image,
    "--data-dir",
    "/tmp",
    `--api-key=${apiKey}`,
  ]);
  running.add(name);
  try {
    const { stdout } = await exec("docker", ["port", name, "8108/tcp"]);
    const port = stdout.trim().split("\n")[0]?.split(":").pop();
    if (!port) throw new Error(`Could not read mapped port for ${name}`);
    const ts = new TypesenseHttp(`http://127.0.0.1:${port}`, apiKey);
    const deadline = Date.now() + 60_000;
    while (!(await ts.health())) {
      if (Date.now() > deadline) {
        throw new Error(`Typesense container ${name} never became healthy`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return { ts, container: name, stop: () => removeContainer(name) };
  } catch (error) {
    await removeContainer(name);
    throw error;
  }
}

/** Wraps a user-provided cluster. The harness wipes it; callers must opt in. */
export function externalCluster(url: string, apiKey: string): Cluster {
  return { ts: new TypesenseHttp(url, apiKey), stop: async () => undefined };
}
