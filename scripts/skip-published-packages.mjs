import { readFile, writeFile } from "node:fs/promises";

export async function versionExists(name, version) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `npm registry preflight failed for ${name}@${version}: HTTP ${response.status}`,
    );
  }
  return true;
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
