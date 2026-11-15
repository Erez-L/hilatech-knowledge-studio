import "server-only";
import { isIP } from "node:net";

/**
 * Resolves the client address from `X-Forwarded-For`, trusting only the
 * proxies we operate.
 *
 * `X-Forwarded-For` is a comma-separated list to which every proxy appends
 * the address it received the request from. Anything a client sends itself
 * sits at the START of the list, so the only trustworthy entries are the last
 * N, where N is the number of proxies in front of the app
 * (`TRUSTED_PROXY_HOPS`). With N = 0 the header is ignored entirely, because
 * anyone can forge it.
 *
 * Returns null when no trustworthy address is available.
 */
export function clientIp(headers: Headers, trustedHops = trustedProxyHops()): string | null {
  if (trustedHops < 1) return null;
  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const chain = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const candidate = chain[chain.length - trustedHops];
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

export function trustedProxyHops(): number {
  const value = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 5) : 0;
}
