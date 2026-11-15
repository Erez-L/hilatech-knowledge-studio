import { sql } from "drizzle-orm";
import type { Executor } from "./client.ts";

export type BudgetAmount = { inputTokens: number; outputTokens: number };
export type BudgetReservation = BudgetAmount & { organizationId: string; day: string };

/** The UTC calendar day a moment belongs to; budgets reset when it changes. */
export const budgetDay = (at: Date = new Date()) => at.toISOString().slice(0, 10);

/**
 * Reserves tokens against an organization's daily budget, or returns null when
 * the reservation does not fit. One conditional statement: PostgreSQL locks the
 * day's row, so two workers reserving at the same moment cannot both pass a
 * limit that only one of them fits under.
 */
export async function reserveBudget(
  tx: Executor,
  organizationId: string,
  amount: BudgetAmount,
  limits: BudgetAmount,
  at: Date = new Date(),
): Promise<BudgetReservation | null> {
  const input = Math.max(0, Math.ceil(amount.inputTokens));
  const output = Math.max(0, Math.ceil(amount.outputTokens));
  if (input > limits.inputTokens || output > limits.outputTokens) return null; // can never fit, even on an empty day
  const day = budgetDay(at);
  const result = await tx.execute(sql`
    INSERT INTO ai_budget_days (organization_id, day, input_tokens, output_tokens)
    VALUES (${organizationId}, ${day}, ${input}, ${output})
    ON CONFLICT (organization_id, day) DO UPDATE
      SET input_tokens = ai_budget_days.input_tokens + EXCLUDED.input_tokens,
          output_tokens = ai_budget_days.output_tokens + EXCLUDED.output_tokens,
          updated_at = now()
      WHERE ai_budget_days.input_tokens + EXCLUDED.input_tokens <= ${limits.inputTokens}
        AND ai_budget_days.output_tokens + EXCLUDED.output_tokens <= ${limits.outputTokens}
    RETURNING day`);
  return result.rows.length ? { organizationId, day, inputTokens: input, outputTokens: output } : null;
}

/**
 * Replaces a reservation with what was actually used (pass zeros to release it).
 * Applied to the day the reservation was made on, also after midnight.
 */
export async function settleBudget(tx: Executor, reservation: BudgetReservation, actual: BudgetAmount): Promise<void> {
  const input = Math.ceil(actual.inputTokens) - reservation.inputTokens;
  const output = Math.ceil(actual.outputTokens) - reservation.outputTokens;
  if (input === 0 && output === 0) return;
  await tx.execute(sql`
    UPDATE ai_budget_days
       SET input_tokens = greatest(0, input_tokens + ${input}), output_tokens = greatest(0, output_tokens + ${output}), updated_at = now()
     WHERE organization_id = ${reservation.organizationId} AND day = ${reservation.day}`);
}

export async function budgetUsed(tx: Executor, organizationId: string, at: Date = new Date()): Promise<BudgetAmount> {
  const result = await tx.execute(sql`SELECT input_tokens, output_tokens FROM ai_budget_days WHERE organization_id = ${organizationId} AND day = ${budgetDay(at)}`);
  const row = result.rows[0] as { input_tokens: string; output_tokens: string } | undefined;
  return { inputTokens: Number(row?.input_tokens ?? 0), outputTokens: Number(row?.output_tokens ?? 0) };
}
