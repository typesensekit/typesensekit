import type { z } from "zod";
import type { TypesenseClient } from "../client.js";

/**
 * Any operation input schema, with its inferred input left as `any` so each
 * entry in an operation array still type-checks its own `execute` against
 * its own schema (Zod 3's `ZodTypeAny` behaved this way; Zod 4's infers
 * `unknown`, which would erase every input type).
 */
// biome-ignore lint/suspicious/noExplicitAny: see comment above.
export type AnyZod = z.ZodType<any>;

export type Operation<I extends z.ZodTypeAny, O> = {
  name: string;
  /** One-line summary, used in compact listings such as `tsk operations`. */
  summary: string;
  /**
   * Longer guidance for agents (when to use it, key inputs, pitfalls).
   * Falls back to `summary` when absent. Use `operationDescription()`.
   */
  description?: string;
  category: string;
  input: I;
  execute: (client: TypesenseClient, input: z.infer<I>) => Promise<O>;
};
