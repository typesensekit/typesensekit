import type { z } from "zod";
import type { TypesenseClient } from "../client.js";

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
