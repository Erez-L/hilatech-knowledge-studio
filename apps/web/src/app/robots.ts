import type { MetadataRoute } from "next";
import { getConfig } from "@hks/shared";
import { locales } from "@/i18n/routing";
import { buildRobots } from "@/lib/site";

// The public address comes from the running server's configuration, not from the build.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(getConfig().APP_BASE_URL, locales);
}
