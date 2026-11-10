import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the `evals/` workspace. */
export const EVALS_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
/** Absolute path of the repository root. */
export const REPO_ROOT = resolve(EVALS_ROOT, "..");
