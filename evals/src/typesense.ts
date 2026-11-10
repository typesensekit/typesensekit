/**
 * Minimal direct Typesense HTTP client used for seeding, reset, oracles, and
 * state grading. Deliberately independent of every interface under test so
 * the harness never grades an interface with itself.
 */
export class TypesenseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly path: string,
  ) {
    super(`Typesense ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

export type SearchParams = Record<string, string | number | boolean>;

export type SearchResponse = {
  found: number;
  hits?: { document: Record<string, unknown> }[];
  facet_counts?: {
    field_name: string;
    counts: { value: string; count: number }[];
    stats?: Record<string, number>;
  }[];
};

export class TypesenseHttp {
  constructor(
    readonly url: string,
    readonly apiKey: string,
  ) {}

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: SearchParams,
  ): Promise<T> {
    const target = new URL(path, this.url);
    for (const [key, value] of Object.entries(query ?? {})) {
      target.searchParams.set(key, String(value));
    }
    const isText = typeof body === "string";
    const response = await fetch(target, {
      method,
      headers: {
        "X-TYPESENSE-API-KEY": this.apiKey,
        "Content-Type": isText ? "text/plain" : "application/json",
      },
      body:
        body === undefined ? undefined : isText ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    if (!response.ok) throw new TypesenseHttpError(response.status, text, path);
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  get<T = unknown>(path: string, query?: SearchParams) {
    return this.request<T>("GET", path, undefined, query);
  }

  /** Returns undefined on 404 instead of throwing. */
  async find<T = unknown>(path: string): Promise<T | undefined> {
    try {
      return await this.get<T>(path);
    } catch (error) {
      if (error instanceof TypesenseHttpError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  }

  search(collection: string, params: SearchParams) {
    return this.get<SearchResponse>(
      `/collections/${encodeURIComponent(collection)}/documents/search`,
      params,
    );
  }

  async exportDocuments<T = Record<string, unknown>>(
    collection: string,
  ): Promise<T[]> {
    const text = await this.get<string | object>(
      `/collections/${encodeURIComponent(collection)}/documents/export`,
    );
    // A single-document export parses as JSON; normalize back to rows.
    if (typeof text !== "string") return [text as T];
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  }

  async health(): Promise<boolean> {
    try {
      const result = await this.get<{ ok?: boolean }>("/health");
      return result.ok === true;
    } catch {
      return false;
    }
  }
}
