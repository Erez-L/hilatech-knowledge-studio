"use client";

import { createAuthClient } from "better-auth/react";

/** Browser client for the authentication endpoints (same origin, cookie session). */
export const authClient = createAuthClient();
