/**
 * Response headers for every page (not the API, whose routes set their own; the original-file
 * download has a stricter, sandboxing policy of its own).
 *
 * Content-Security-Policy, chosen to keep working with what Next.js sends:
 * - script-src allows 'unsafe-inline' because the App Router streams its page data and bootstrap
 *   as inline <script> tags. A nonce would remove that need, but it requires rendering every page
 *   dynamically and has not been verified with a production build here. The policy still allows
 *   scripts only from this origin, so no third-party script can be loaded.
 * - style-src allows 'unsafe-inline' for the style attributes React and the animation library set.
 * - frame-ancestors 'none' (and X-Frame-Options DENY for older browsers): no other site can frame
 *   the application.
 * - object-src 'none', base-uri 'self' and form-action 'self' close the remaining injection paths.
 * Fonts, images and data are all served from this origin; images also come as data: and blob:
 * URLs (icons, rendered pages). Development adds what the dev server needs (eval, websocket).
 */
export function contentSecurityPolicy({ development }: { development: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(development ? ["ws:", "wss:"] : [])],
    "frame-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders({ development }: { development: boolean }): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ development }) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  ];
}

/** Every path except the API (route handlers set their own headers). */
export const PAGE_HEADERS_SOURCE = "/((?!api/).*)";
