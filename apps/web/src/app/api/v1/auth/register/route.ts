import { clientIp } from "@/lib/client-ip";
import { json, route } from "@/server/http";
import { registerSchema, startRegistration } from "@/server/registration";
import { readBody } from "../_shared";

export const runtime = "nodejs";

/** Starts a sign-up. Always answers 202 for a valid form, whether or not the address is already registered. */
export const POST = route(async ({ request, requestId }) => {
  await startRegistration(await readBody(request, registerSchema), clientIp(request.headers));
  return json({ ok: true }, requestId, 202);
});
