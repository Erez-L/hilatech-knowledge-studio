/** Typed browser client for the application's own API. All requests are same-origin and carry the session cookie. */
import type { ConversationView, DocumentView, MessageView } from "@/server/views";

export type { ConversationView, DocumentView, MessageView };

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(code);
  }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
  throw new ApiError(body?.error?.code ?? "internal", response.status, Number(response.headers.get("retry-after")) || null);
}

const get = <T>(url: string, signal?: AbortSignal) => fetch(url, { signal, cache: "no-store" }).then((r) => parse<T>(r));
const send = <T>(url: string, method: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => parse<T>(r));

export type Me = {
  user: { id: string; email: string; name: string | null; locale: "he" | "en" };
  organization: { id: string; name: string; kind: "standard" | "demo" };
  role: "owner" | "admin" | "member";
  capabilities: { upload: boolean; deleteAnyDocument: boolean; manageMembers: boolean };
  pipeline: { mode: "live" | "sample" | "unconfigured"; answering: boolean; indexing: boolean };
  limits: { uploadMaxBytes: number; questionsPerDay: number; questionMaxChars: number };
};

export type SourceView = {
  label: string;
  ordinal: number;
  chunkId: string | null;
  documentId: string | null;
  documentTitle: string | null;
  fileType?: string;
  pageNumber: number | null;
  sectionPath: string[] | null;
  excerpt: string | null;
  sourceState?: "available" | "removed";
};

export type DocumentContent = {
  document: { id: string; title: string; fileType: string; pageCount: number | null; status: string };
  page: number | null;
  chunks: { id: string; index: number; pageNumber: number | null; pageEnd: number | null; sectionPath: string[] | null; text: string }[];
};

export type ChatEvent =
  | { type: "start"; conversationId: string; userMessageId: string; pipelineMode: "live" | "sample" }
  | { type: "text"; text: string }
  | { type: "citation"; source: SourceView }
  | { type: "marker"; label: string }
  | { type: "done"; messageId: string; status: "complete" | "cancelled"; answerStatus: "answered" | "insufficient_evidence" | "uncited"; sources: SourceView[] }
  | { type: "error"; code: string; messageId: string | null };

export type Scope = "app" | "demo";

/**
 * The API client for one scope. "app" is the signed-in application; "demo" is
 * the public demo, which is read-only and has no library, history or usage API.
 */
export function createApi(scope: Scope) {
  const base = scope === "demo" ? "/api/v1/demo" : "/api/v1";
  const demoStatus = (signal?: AbortSignal) =>
    get<{ available: boolean; me?: Me; documents?: DocumentView[] }>(base, signal).then((status) => {
      if (!status.available || !status.me) throw new ApiError("not_configured", 503);
      return status as { available: true; me: Me; documents: DocumentView[] };
    });
  return {
  scope,
  urls: {
    pageImage: (documentId: string, page: number) => `${base}/documents/${documentId}/pages/${page}`,
    /** The original file can be downloaded in the app only. */
    file: (documentId: string) => (scope === "app" ? `${base}/documents/${documentId}/file` : null),
  },
  me: (signal?: AbortSignal) => (scope === "demo" ? demoStatus(signal).then((s) => s.me) : get<Me>(`${base}/me`, signal)),
  documents: (query = "", signal?: AbortSignal) =>
    scope === "demo"
      ? demoStatus(signal).then((s) => s.documents)
      : get<{ documents: DocumentView[] }>(`${base}/documents${query ? `?q=${encodeURIComponent(query)}` : ""}`, signal).then((r) => r.documents),
  deleteDocument: (id: string) => send<{ deleted: true }>(`${base}/documents/${id}`, "DELETE"),
  retryDocument: (id: string) => send<{ queued: true }>(`${base}/documents/${id}/retry`, "POST", {}),
  documentContent: (id: string, page?: number, signal?: AbortSignal) =>
    get<DocumentContent>(`${base}/documents/${id}/content${page ? `?page=${page}` : ""}`, signal),
  conversations: (signal?: AbortSignal) =>
    scope === "demo"
      ? Promise.resolve([] as ConversationView[]) // the demo keeps no history list
      : get<{ conversations: ConversationView[] }>(`${base}/conversations`, signal).then((r) => r.conversations),
  conversation: (id: string, signal?: AbortSignal) =>
    get<{ conversation: ConversationView; messages: MessageView[] }>(`${base}/conversations/${id}`, signal),
  deleteConversation: (id: string) => send<{ deleted: true }>(`${base}/conversations/${id}`, "DELETE"),
  usage: (signal?: AbortSignal) =>
    scope === "demo"
      ? Promise.reject(new ApiError("not_found", 404))
      : get<{ today: { questions: number }; limits: { questionsPerDay: number } }>(`${base}/usage`, signal),

  /** Upload with progress. Resolves with the accepted document (not yet ready). */
  upload(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<DocumentView> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${base}/documents`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve((xhr.response as { document: DocumentView }).document);
        else reject(new ApiError((xhr.response as { error?: { code?: string } } | null)?.error?.code ?? "internal", xhr.status));
      };
      xhr.onerror = () => reject(new ApiError("network", 0));
      xhr.onabort = () => reject(new ApiError("aborted", 0));
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    });
  },

  /** Asks a question and yields the server's events as they arrive. */
  async *ask(input: { question: string; conversationId?: string; locale: "he" | "en" }, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
      throw new ApiError(body?.error?.code ?? "internal", response.status, Number(response.headers.get("retry-after")) || null);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (block.startsWith("data: ")) yield JSON.parse(block.slice(6)) as ChatEvent;
      }
    }
  },
  };
}

export type Api = ReturnType<typeof createApi>;
