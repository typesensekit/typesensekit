import { aliasesOperations } from "./aliases.js";
import { analyticsOperations } from "./analytics.js";
import { apiOperations } from "./api.js";
import { collectionOperations } from "./collections.js";
import { conversationOperations } from "./conversations.js";
import { curationSetOperations } from "./curation-sets.js";
import { documentOperations } from "./documents.js";
import { keysOperations } from "./keys.js";
import { overridesOperations } from "./overrides.js";
import { presetsOperations } from "./presets.js";
import { searchOperations } from "./search.js";
import { stopwordsOperations } from "./stopwords.js";
import { synonymSetOperations } from "./synonym-sets.js";
import { synonymsOperations } from "./synonyms.js";
import { systemOperations } from "./system.js";
import type { Operation } from "./types.js";

export const operations = [
  ...collectionOperations,
  ...documentOperations,
  ...searchOperations,
  ...aliasesOperations,
  ...synonymsOperations,
  ...synonymSetOperations,
  ...curationSetOperations,
  ...overridesOperations,
  ...keysOperations,
  ...analyticsOperations,
  ...presetsOperations,
  ...stopwordsOperations,
  ...conversationOperations,
  ...apiOperations,
  ...systemOperations,
] satisfies Operation<import("zod").ZodTypeAny, unknown>[];

export type { Operation } from "./types.js";
