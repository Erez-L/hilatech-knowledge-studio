import { reserveBudget, settleBudget, withTenant, type BudgetAmount, type BudgetReservation } from "@hks/database";
import { AppError } from "@hks/shared";
import type { Services } from "./services.ts";

/**
 * Reserves tokens against the organization's daily AI budget BEFORE a provider is called, for
 * every kind of call: document embedding (uploads, retries, demo seeding), query embedding and
 * chat. Throws budget_exceeded when the reservation does not fit. Test doubles are counted too,
 * with their estimated tokens, so the same code path is exercised in tests.
 */
export async function reserveAiBudget(services: Services, organizationId: string, amount: BudgetAmount, what: string): Promise<BudgetReservation> {
  const limits = { inputTokens: services.config.BUDGET_DAILY_INPUT_TOKENS, outputTokens: services.config.BUDGET_DAILY_OUTPUT_TOKENS };
  const reservation = await withTenant(services.db, organizationId, (tx) => reserveBudget(tx, organizationId, amount, limits));
  if (!reservation) throw new AppError("budget_exceeded", `The daily AI usage budget for this organization does not cover ${what}. It resets at midnight UTC`);
  return reservation;
}

/** Replaces a reservation with actual usage; zeros release it. Never throws: accounting must not mask the real outcome. */
export async function settleAiBudget(services: Services, reservation: BudgetReservation, actual: BudgetAmount): Promise<void> {
  await withTenant(services.db, reservation.organizationId, (tx) => settleBudget(tx, reservation, actual)).catch(() => {});
}
