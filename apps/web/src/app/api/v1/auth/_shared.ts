import "server-only";
import type { z } from "zod";
import { AppError } from "@hks/shared";
import { readTextBody } from "@/server/body";

const MAX_BODY_BYTES = 4 * 1024;

/** Reads a small JSON body and validates it. Never echoes what was sent. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const raw = await readTextBody(request, MAX_BODY_BYTES);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError("bad_request", "Invalid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AppError("validation", "Check the fields and try again");
  return parsed.data;
}
