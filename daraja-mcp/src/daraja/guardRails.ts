import { config } from "../config.js";
import { todaysOutboundTotal } from "../store/db.js";

/**
 * Shared safety checks for every tool that moves money OUT (b2c, b2b, reversal).
 * Throws with a clear message if the call should be blocked. Callers must pass
 * `confirm: true` — this is the "the user explicitly confirmed this in chat"
 * signal; the tool description tells Claude never to set it on its own.
 */
export async function enforceMoneyOutGuardRails(params: { amount: number; confirm: boolean }): Promise<void> {
  if (!params.confirm) {
    throw new Error(
      "Refusing to send: `confirm` was not set to true. Only set confirm:true after the user has " +
        "explicitly confirmed the exact amount and recipient in the conversation."
    );
  }
  if (params.amount <= 0) {
    throw new Error("Amount must be greater than 0.");
  }
  if (params.amount > config.maxTransactionAmount) {
    throw new Error(
      `Amount ${params.amount} exceeds the per-transaction cap of ${config.maxTransactionAmount} ` +
        `(set via MAX_TRANSACTION_AMOUNT). Raise the env var if this is intentional.`
    );
  }
  const spentToday = await todaysOutboundTotal();
  if (spentToday + params.amount > config.maxDailyAmount) {
    throw new Error(
      `This would bring today's total money-out to ${spentToday + params.amount}, over the daily cap of ` +
        `${config.maxDailyAmount} (set via MAX_DAILY_AMOUNT). Already sent today: ${spentToday}.`
    );
  }
}
