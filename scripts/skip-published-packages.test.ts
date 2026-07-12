import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { skipPublishedPackage } from "./skip-published-packages.mjs";

let directory: string | undefined;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function fixture() {
  directory = await mkdtemp(join(tmpdir(), "typesensekit-publish-"));
  const path = join(directory, "package.json");
  await writeFile(
    path,
    `${JSON.stringify({ name: "@typesensekit/test", version: "1.2.3" })}\n`,
  );
  return path;
}

describe("published package preflight", () => {
  it("marks an existing version private for the runner", async () => {
    const path = await fixture();
    const exists = vi.fn().mockResolvedValue(true);
    await expect(skipPublishedPackage(path, exists)).resolves.toBe(true);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      private: true,
    });
    expect(exists).toHaveBeenCalledWith("@typesensekit/test", "1.2.3");
  });

  it("leaves an unpublished version eligible", async () => {
    const path = await fixture();
    await expect(
      skipPublishedPackage(path, vi.fn().mockResolvedValue(false)),
    ).resolves.toBe(false);
    expect(JSON.parse(await readFile(path, "utf8"))).not.toHaveProperty(
      "private",
    );
  });
});
