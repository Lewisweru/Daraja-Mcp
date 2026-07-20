import { config } from "../config.js";
import { darajaClient, callbackUrl, normalizeMsisdn } from "./client.js";

/**
 * One-time setup: registers your shortcode for the Pull Transactions
 * reconciliation API. Must be done once (per shortcode) before
 * pullTransactionsQuery will return anything.
 */
export async function registerPullTransactions(nominatedNumber: string) {
  const body = {
    // Confirmed via Safaricom's own validation ("Kindly use your own
    // ShortCode") that Pull Transactions must use the org-level API
    // shortcode, not the customer-facing till number.
    ShortCode: config.shortcode,
    RequestType: "Pull",
    NominatedNumber: normalizeMsisdn(nominatedNumber),
    CallBackURL: callbackUrl("/callbacks/pull-transactions/register"),
  };
  const res = await darajaClient().post(config.paths.pullTransactionsRegister, body);
  return res.data;
}

export interface PullTransactionsQueryInput {
  /** Format: "YYYY-MM-DD HH:mm:ss" */
  startDate: string;
  /** Format: "YYYY-MM-DD HH:mm:ss" */
  endDate: string;
  /** Pagination offset, starting at 0. */
  offsetValue?: number;
}

/**
 * Fetches C2B transactions (Paybill/Buy Goods/STK Push payments received)
 * for your shortcode within the given window. Only covers the last 48
 * hours of data, and only C2B — money you sent out (B2C/B2B) isn't included.
 */
export async function pullTransactionsQuery(input: PullTransactionsQueryInput) {
  const body = {
    ShortCode: config.shortcode,
    StartDate: input.startDate,
    EndDate: input.endDate,
    OffSetValue: String(input.offsetValue ?? 0),
  };
  const res = await darajaClient().post(config.paths.pullTransactionsQuery, body);
  return res.data;
}
