import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function versionExists(name, version) {
  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["view", `${name}@${version}`, "version", "--json"],
      { env: process.env },
    );
    return JSON.parse(stdout) === version;
  } catch {
    return false;
  }
}

export async function skipPublishedPackage(
  packagePath,
  exists = versionExists,
) {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageJson.private || !packageJson.name || !packageJson.version) {
    return false;
  }
  if (!(await exists(packageJson.name, packageJson.version))) return false;

  packageJson.private = true;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  console.log(
    `Skipping already-published ${packageJson.name}@${packageJson.version}`,
  );
  return true;
}

if (process.argv[1]?.endsWith("skip-published-packages.mjs")) {
  for (const packagePath of [
    "packages/cli/package.json",
    "packages/mcp/package.json",
  ]) {
    await skipPublishedPackage(packagePath);
  }
}
