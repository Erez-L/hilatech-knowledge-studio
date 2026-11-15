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

export const api = {
  me: (signal?: AbortSignal) => get<Me>("/api/v1/me", signal),
  documents: (query = "", signal?: AbortSignal) =>
    get<{ documents: DocumentView[] }>(`/api/v1/documents${query ? `?q=${encodeURIComponent(query)}` : ""}`, signal).then((r) => r.documents),
  deleteDocument: (id: string) => send<{ deleted: true }>(`/api/v1/documents/${id}`, "DELETE"),
  retryDocument: (id: string) => send<{ queued: true }>(`/api/v1/documents/${id}/retry`, "POST", {}),
  documentContent: (id: string, page?: number, signal?: AbortSignal) =>
    get<DocumentContent>(`/api/v1/documents/${id}/content${page ? `?page=${page}` : ""}`, signal),
  conversations: (signal?: AbortSignal) => get<{ conversations: ConversationView[] }>("/api/v1/conversations", signal).then((r) => r.conversations),
  conversation: (id: string, signal?: AbortSignal) =>
    get<{ conversation: ConversationView; messages: MessageView[] }>(`/api/v1/conversations/${id}`, signal),
  deleteConversation: (id: string) => send<{ deleted: true }>(`/api/v1/conversations/${id}`, "DELETE"),
  usage: (signal?: AbortSignal) =>
    get<{ today: { questions: number }; limits: { questionsPerDay: number } }>("/api/v1/usage", signal),

  /** Upload with progress. Resolves with the accepted document (not yet ready). */
  upload(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<DocumentView> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/v1/documents");
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
    const response = await fetch("/api/v1/chat", {
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
