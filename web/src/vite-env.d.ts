/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

export interface AgentAPI {
  listCollections: () => Promise<{ id: string; name: string }[]>;
  getCollection: (id: string) => Promise<Record<string, unknown>>;
  saveCollection: (
    id: string,
    body: Record<string, unknown>
  ) => Promise<null>;
  deleteCollection: (id: string) => Promise<null>;
  listEnvironments: () => Promise<{ id: string; name: string }[]>;
  getEnvironment: (id: string) => Promise<Record<string, unknown>>;
  saveEnvironment: (
    id: string,
    body: Record<string, unknown>
  ) => Promise<null>;
  deleteEnvironment: (id: string) => Promise<null>;
  /** Git: настройки в bbolt (без PAT в JSON), токен отдельно */
  getGitSettings?: () => Promise<Record<string, unknown>>;
  putGitSettings?: (body: Record<string, unknown>) => Promise<null>;
  putGitCredentials?: (b: { repoId: string; httpsToken: string }) => Promise<null>;
  gitListBranches?: (b: { repoId?: string }) => Promise<{ branches: string[] }>;
  gitSync?: (b: { repoId?: string }) => Promise<{
    ok: boolean;
    head?: string;
    message?: string;
    outcome?: string;
  }>;
}

export type HttpRequestPayload = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  /** Если задано, тело запроса — бинарные данные (Buffer в main), строка — base64 без префикса data: */
  bodyBase64?: string | null;
  timeoutMs?: number;
};

export type HttpResponseResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      durationMs: number;
    }
  | {
      ok: false;
      error: string;
      durationMs: number;
    };

declare global {
  interface Window {
    desktop?: {
      platform: string;
      httpRequest: (p: HttpRequestPayload) => Promise<HttpResponseResult>;
    };
    agent?: AgentAPI;
  }
}

export {};
