import { AppError } from "@hks/shared";

/**
 * Reads a request body as text, refusing it as soon as it is larger than `maxBytes`: first by
 * the declared Content-Length, then while reading (a body sent without a length, or longer than
 * it declared), so an oversized body is never held in memory whole.
 */
export async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) throw new AppError("payload_too_large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new AppError("payload_too_large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Largest body any API route except the document upload accepts. */
export const MAX_API_BODY_BYTES = 64 * 1024;
