import type { Task } from "../src/types.js";
import { readTasks } from "./read.js";
import { writeTasks } from "./write.js";

export const tasks: Task[] = [...readTasks, ...writeTasks];

const ids = new Set<string>();
for (const task of tasks) {
  if (ids.has(task.id)) throw new Error(`Duplicate task id ${task.id}`);
  ids.add(task.id);
}

/**
 * Comma-separated filters. Each term matches a task id exactly, an id prefix
 * ending in "." or "*" (e.g. `search.` or `debug.*`), a category, a
 * difficulty, or a mode (`read-only`, `full-access`). Prefix a term with `!`
 * to exclude. Empty selects everything.
 */
export function selectTasks(filter: string | undefined): Task[] {
  const terms = (filter ?? "")
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
  const include = terms.filter((term) => !term.startsWith("!"));
  const exclude = terms
    .filter((term) => term.startsWith("!"))
    .map((t) => t.slice(1));
  const matches = (task: Task, term: string) =>
    task.id === term ||
    (term.endsWith("*") && task.id.startsWith(term.slice(0, -1))) ||
    (term.endsWith(".") && task.id.startsWith(term)) ||
    task.category === term ||
    task.difficulty === term ||
    task.mode === term;
  return tasks.filter(
    (task) =>
      (include.length === 0 || include.some((term) => matches(task, term))) &&
      !exclude.some((term) => matches(task, term)),
  );
}
