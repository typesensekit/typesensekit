import type { z } from "zod";
import type { TypesenseClient } from "../client.js";

export type Operation<I extends z.ZodTypeAny, O> = {
  name: string;
  summary: string;
  category: string;
  input: I;
  execute: (client: TypesenseClient, input: z.infer<I>) => Promise<O>;
};
