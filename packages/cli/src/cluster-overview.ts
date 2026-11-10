import {
  aliasesByCollection,
  renderCollectionsCompact,
} from "./collection-summary.js";
import { resolveServerConfig } from "./profile/resolve.js";

const MAX_DETAILED_COLLECTIONS = 20;

/**
 * Live summary of the configured cluster's collections for `tsk` and
 * `tsk operations`, so the first command already shows real names and fields.
 * Returns undefined when no cluster is configured or it does not answer
 * quickly. Set TSK_NO_OVERVIEW=1 to skip it.
 */
export async function clusterOverview(
  timeoutMs = 2500,
): Promise<string | undefined> {
  if (process.env.TSK_NO_OVERVIEW) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([loadOverview(), timeout]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadOverview(): Promise<string | undefined> {
  const config = await resolveServerConfig({});
  // A plain single request: the overview is optional, so no client retries
  // or retry logging when the cluster is unreachable.
  const get = async (path: string) => {
    const base = config.url.endsWith("/") ? config.url : `${config.url}/`;
    const response = await fetch(new URL(path, base), {
      headers: { "X-TYPESENSE-API-KEY": config.apiKey },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as unknown;
  };
  const [collections, aliases] = await Promise.all([
    get("collections"),
    get("aliases").catch(() => undefined),
  ]);
  if (!Array.isArray(collections)) return undefined;
  const byCollection = aliasesByCollection(aliases);
  const header =
    "# Collections on the connected cluster (same as tsk collections list --compact):";
  if (!collections.length) return `${header}\n(no collections)`;
  if (collections.length > MAX_DETAILED_COLLECTIONS) {
    return [
      header,
      ...collections.map((collection: Record<string, unknown>) => {
        const name = String(collection?.name);
        const aliasNames = byCollection.get(name) ?? [];
        return `${name}: ${String(collection?.num_documents ?? "?")} documents${aliasNames.length ? ` | aliases: ${aliasNames.join(", ")}` : ""}`;
      }),
      "# Fields: tsk collections retrieve <collection> --compact",
    ].join("\n");
  }
  return [
    header,
    renderCollectionsCompact(collections, byCollection, false),
  ].join("\n");
}
