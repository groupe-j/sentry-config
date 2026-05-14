/**
 * User context helpers.
 *
 * Call `setSentryUser` right after authentication (BetterAuth onSession,
 * Clerk userSession, or your own auth middleware). Sentry events captured
 * after this call will include the user identity and any tenant tags.
 *
 * Call `clearSentryUser` on logout.
 */

import * as Sentry from "@sentry/nextjs";

export type SentryUserContext = {
  /** Stable user identifier (DB id, NOT email). */
  id: string;
  /** Optional — only set if email is OK to send (consider PDPA/RGPD). */
  email?: string;
  /** Tenant/org/agency id for multi-tenant apps (ridesamui, prono.pro, mirey). */
  tenant?: string;
  /** Plan tier (free/premium/enterprise) — useful for "is this a paying client?". */
  plan?: string;
};

export function setSentryUser(user: SentryUserContext): void {
  Sentry.setUser({
    id: user.id,
    ...(user.email && { email: user.email }),
  });
  if (user.tenant) Sentry.setTag("tenant", user.tenant);
  if (user.plan) Sentry.setTag("plan", user.plan);
}

export function clearSentryUser(): void {
  Sentry.setUser(null);
  Sentry.setTag("tenant", undefined as unknown as string);
  Sentry.setTag("plan", undefined as unknown as string);
}
