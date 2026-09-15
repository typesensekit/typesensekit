import type { TypesenseClient } from "../client.js";

export type Query = Record<string, unknown>;

export type ApiClient = {
  apiCall: {
    get: <T = unknown>(
      endpoint: string,
      queryParameters?: Query,
      options?: { responseType?: "text" },
    ) => Promise<T>;
    delete: <T = unknown>(
      endpoint: string,
      queryParameters?: Query,
    ) => Promise<T>;
    post: <T = unknown>(
      endpoint: string,
      bodyParameters?: unknown,
      queryParameters?: Query,
      additionalHeaders?: Record<string, string>,
      options?: { responseType?: "text" },
    ) => Promise<T>;
    put: <T = unknown>(
      endpoint: string,
      bodyParameters?: unknown,
      queryParameters?: Query,
    ) => Promise<T>;
    patch: <T = unknown>(
      endpoint: string,
      bodyParameters?: unknown,
      queryParameters?: Query,
    ) => Promise<T>;
  };
};

export function api(client: TypesenseClient): ApiClient["apiCall"] {
  return (client as unknown as ApiClient).apiCall;
}

export function enc(value: string): string {
  return encodeURIComponent(value);
}

export function collectionPath(collection: string): string {
  return `/collections/${enc(collection)}`;
}
