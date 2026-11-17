import { clientIp } from "@/lib/client-ip";
import { json, route } from "@/server/http";
import { resendRegistration, resendSchema } from "@/server/registration";
import { readBody } from "../../_shared";

export const runtime = "nodejs";

export const POST = route(async ({ request, requestId }) => {
  await resendRegistration(await readBody(request, resendSchema), clientIp(request.headers));
  return json({ ok: true }, requestId, 202);
});
