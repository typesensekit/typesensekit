import { aliasesOperations } from "./aliases.js";
import { analyticsOperations } from "./analytics.js";
import { apiOperations } from "./api.js";
import { collectionOperations } from "./collections.js";
import { conversationOperations } from "./conversations.js";
import { curationSetOperations } from "./curation-sets.js";
import { documentOperations } from "./documents.js";
import { keysOperations } from "./keys.js";
import { nlSearchModelOperations } from "./nl-search-models.js";
import { overridesOperations } from "./overrides.js";
import { presetsOperations } from "./presets.js";
import { searchOperations } from "./search.js";
import { stemmingOperations } from "./stemming.js";
import { stopwordsOperations } from "./stopwords.js";
import { synonymSetOperations } from "./synonym-sets.js";
import { synonymsOperations } from "./synonyms.js";
import { systemOperations } from "./system.js";
import type { AnyZod, Operation } from "./types.js";

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
  ...stemmingOperations,
  ...conversationOperations,
  ...nlSearchModelOperations,
  ...apiOperations,
  ...systemOperations,
] satisfies Operation<AnyZod, unknown>[];

export function operationDescription(operation: {
  summary: string;
  description?: string;
}): string {
  return operation.description ?? operation.summary;
}

export {
  collectionFieldsHint,
  fieldSummary,
  textFieldNames,
} from "./field-summary.js";
export {
  compactSearchResult,
  FILTER_BY_HELP,
  searchParamsSchema,
} from "./search-params.js";
export type { AnyZod, Operation } from "./types.js";
