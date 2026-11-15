/** Closed set of stable error codes. Clients branch on `code`, never on text. */
export const ERROR_CODES = [
  "bad_request",
  "validation",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "budget_exceeded",
  "payload_too_large",
  "unsupported_file_type",
  "unsupported_scanned_pdf",
  "malformed_file",
  "duplicate_document",
  "extraction_failed",
  "embedding_failed",
  "too_many_pages",
  "provider_not_configured",
  "provider_error",
  "not_configured",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  validation: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  budget_exceeded: 429,
  payload_too_large: 413,
  unsupported_file_type: 415,
  unsupported_scanned_pdf: 422,
  malformed_file: 422,
  duplicate_document: 409,
  extraction_failed: 422,
  embedding_failed: 502,
  too_many_pages: 422,
  provider_not_configured: 503,
  provider_error: 502,
  not_configured: 503,
  internal: 500,
};

/**
 * An error that is safe to show to a client. `detail` must never contain
 * document text, secrets or internal paths.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: ErrorCode, detail?: string, options?: { cause?: unknown }) {
    super(detail ? `${code}: ${detail}` : code, options);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.detail = detail;
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
