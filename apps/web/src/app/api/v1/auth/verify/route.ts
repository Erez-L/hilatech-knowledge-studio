import { clientIp } from "@/lib/client-ip";
import { json, route } from "@/server/http";
import { completeRegistration, verifySchema } from "@/server/registration";
import { readBody } from "../_shared";

export const runtime = "nodejs";

/**
 * Confirms an email address and creates the account. A POST, sent when the person presses
 * the button on the confirmation page: mail scanners that open links cannot use up the token.
 */
export const POST = route(async ({ request, requestId }) => {
  const { token } = await readBody(request, verifySchema);
  await completeRegistration(token, clientIp(request.headers));
  return json({ ok: true }, requestId, 201);
});
