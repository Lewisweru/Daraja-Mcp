import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stkPush, stkPushQuery } from "../daraja/stkpush.js";
import { c2bRegisterUrls, c2bSimulate } from "../daraja/c2b.js";
import { b2cPayment } from "../daraja/b2c.js";
import { b2bPayment } from "../daraja/b2b.js";
import { b2bExpressCheckout } from "../daraja/b2bExpressCheckout.js";
import { registerPullTransactions, pullTransactionsQuery } from "../daraja/pullTransactions.js";
import { transactionStatus } from "../daraja/transactionStatus.js";
import { accountBalance } from "../daraja/accountBalance.js";
import { reversal } from "../daraja/reversal.js";
import { b2Pochi } from "../daraja/b2pochi.js";

import { extractErrorMessage } from "../daraja/client.js";
import { getTransaction, listRecentTransactions } from "../store/db.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorText(err: unknown) {
  return { content: [{ type: "text" as const, text: `Error: ${extractErrorMessage(err)}` }], isError: true };
}

export function registerTools(server: McpServer) {
  server.tool(
    "stk_push",
    "Send an STK Push (Lipa Na M-Pesa Online) to a customer's phone, prompting them to enter their M-Pesa " +
      "PIN to pay you. Use this to collect a payment. Returns a requestId/CheckoutRequestID — the result " +
      "arrives asynchronously; poll with stk_push_query or check_transaction_result.",
    {
      phone: z.string().describe("Customer phone number, e.g. 0712345678 or 254712345678"),
      amount: z.number().positive().describe("Amount in KES"),
      accountReference: z.string().describe("Short reference shown to the customer (max 12 chars)"),
      transactionDesc: z.string().default("Payment").describe("Short description (max 13 chars)"),
    },
    async (input) => {
      try {
        return text(await stkPush(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "stk_push_query",
    "Check the status of a previously sent STK Push by its CheckoutRequestID.",
    { checkoutRequestId: z.string() },
    async ({ checkoutRequestId }) => {
      try {
        return text(await stkPushQuery(checkoutRequestId));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "c2b_register_urls",
    "One-time setup: registers this service's validation/confirmation URLs with Daraja for your " +
      "shortcode, so customer-initiated paybill/till payments get reported here.",
    {},
    async () => {
      try {
        return text(await c2bRegisterUrls());
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "c2b_simulate",
    "SANDBOX ONLY: simulates a customer paying your paybill/till from their M-Pesa menu, for testing. " +
      "Rejected automatically in production.",
    {
      phone: z.string(),
      amount: z.number().positive(),
      billRefNumber: z.string().default("TEST"),
    },
    async (input) => {
      try {
        return text(await c2bSimulate(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "b2c_payment",
    "Send money OUT from your business to a customer's phone (refund, payout, salary). Moves real money " +
      "and cannot be undone by retrying. Only call with confirm:true after the user has explicitly " +
      "confirmed the exact amount and recipient phone number in this conversation.",
    {
      phone: z.string().describe("Recipient phone number"),
      amount: z.number().positive().describe("Amount in KES"),
      remarks: z.string().describe("Reason for the payment"),
      occasion: z.string().optional(),
      commandId: z.enum(["SalaryPayment", "BusinessPayment", "PromotionPayment"]).optional(),
      confirm: z
        .boolean()
        .describe("Must be true. Only set true after explicit user confirmation of amount + recipient."),
    },
    async (input) => {
      try {
        return text(await b2cPayment(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "b2pochi_payment",
    "Send money OUT to a Pochi la Biashara (micro-SME) business wallet by phone number. Distinct from " +
      "b2c_payment/b2b_payment — dedicated Pochi product, min Ksh 10 per transaction, no API reversal " +
      "support (undo via the M-Pesa portal only). Moves real money and cannot be undone by retrying. Only " +
      "call with confirm:true after explicit user confirmation of amount + recipient.",
    {
      phone: z.string().describe("The Pochi la Biashara wallet's phone number"),
      amount: z.number().positive().describe("Amount in KES, minimum 10"),
      remarks: z.string().describe("Reason for the payment"),
      occasion: z.string().optional(),
      confirm: z.boolean().describe("Must be true. Only set true after explicit user confirmation."),
    },
    async (input) => {
      try {
        return text(await b2Pochi(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "b2b_payment",
    "Send money OUT from your business shortcode to another business's paybill or till. Moves real money " +
      "and cannot be undone by retrying. Only call with confirm:true after explicit user confirmation.",
    {
      receiverShortcode: z.string().describe("Recipient business paybill/till number"),
      amount: z.number().positive(),
      accountReference: z.string().describe("Up to 13 characters"),
      remarks: z.string(),
      commandId: z
        .enum(["BusinessPayBill", "BusinessBuyGoods"])
        .default("BusinessBuyGoods")
        .describe("BusinessBuyGoods for a till number, BusinessPayBill for a paybill number"),
      requester: z.string().optional().describe("Consumer's phone number, if paying on their behalf"),
      confirm: z.boolean().describe("Must be true. Only set true after explicit user confirmation."),
    },
    async (input) => {
      try {
        return text(await b2bPayment(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "b2b_express_checkout",
    "Request a payment INTO your paybill from another business's till (USSD Push to Till) — sends the " +
      "other till a USSD prompt asking their operator to enter their Operator ID + PIN to approve. This " +
      "collects money, it does not send money out, so no confirm flag is needed — the other merchant has " +
      "to approve it on their end regardless. Results arrive asynchronously.",
    {
      primaryShortCode: z.string().describe("The OTHER merchant's till number being asked to pay (debited)"),
      amount: z.number().positive().describe("Amount in KES"),
      paymentRef: z.string().describe("Reference shown to the merchant, e.g. an invoice/account number"),
      partnerName: z.string().describe("Your business's friendly name, shown to the merchant"),
      receiverShortCode: z
        .string()
        .optional()
        .describe("Your paybill being credited; defaults to your configured shortcode"),
    },
    async (input) => {
      try {
        return text(await b2bExpressCheckout(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "pull_transactions_register",
    "One-time setup: registers your shortcode with Daraja's Pull Transactions reconciliation API. Must " +
      "be done once before pull_transactions_query will return any data.",
    {
      nominatedNumber: z
        .string()
        .describe("The Safaricom MSISDN tied to your organization account (from the M-Pesa portal KYC details)"),
    },
    async ({ nominatedNumber }) => {
      try {
        return text(await registerPullTransactions(nominatedNumber));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "pull_transactions_query",
    "List C2B transactions (Paybill/Buy Goods/STK Push payments received) on your shortcode for a date " +
      "range. Only covers the last 48 hours, and only money received — not b2c_payment/b2b_payment sends. " +
      "Requires pull_transactions_register to have been run once already.",
    {
      startDate: z.string().describe('Format: "YYYY-MM-DD HH:mm:ss"'),
      endDate: z.string().describe('Format: "YYYY-MM-DD HH:mm:ss"'),
      offsetValue: z.number().int().nonnegative().default(0).describe("Pagination offset, starting at 0"),
    },
    async (input) => {
      try {
        return text(await pullTransactionsQuery(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "transaction_status",
    "Look up the status of any past M-Pesa transaction by its transaction ID (the M-Pesa receipt number).",
    { transactionId: z.string(), remarks: z.string().optional() },
    async ({ transactionId, remarks }) => {
      try {
        return text(await transactionStatus(transactionId, remarks));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "account_balance",
    "Check the working account balance of your M-Pesa shortcode/till.",
    { remarks: z.string().optional() },
    async ({ remarks }) => {
      try {
        return text(await accountBalance(remarks));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "reversal",
    "Reverse a completed M-Pesa transaction, returning the money to the original sender. Moves real money " +
      "and cannot be undone by retrying. Only call with confirm:true after explicit user confirmation.",
    {
      transactionId: z.string().describe("M-Pesa receipt number of the transaction to reverse"),
      amount: z.number().positive().describe("Original transaction amount"),
      remarks: z.string(),
      occasion: z.string().optional(),
      confirm: z.boolean().describe("Must be true. Only set true after explicit user confirmation."),
    },
    async (input) => {
      try {
        return text(await reversal(input));
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    "check_transaction_result",
    "Look up the stored result of a transaction previously initiated via stk_push, b2c_payment, " +
      "b2b_payment, or reversal, by the requestId or Daraja reference (CheckoutRequestID/ConversationID) " +
      "returned at the time. Callback results can take a few seconds to a couple minutes to arrive.",
    { id: z.string().describe("requestId or Daraja reference returned by the original tool call") },
    async ({ id }) => {
      const row = await getTransaction(id);
      if (!row) {
        return text({ found: false, message: "No transaction found with that id yet." });
      }
      return text({
        found: true,
        status: row.status,
        kind: row.kind,
        amount: row.amount,
        party: row.party,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        result: row.result_payload ? JSON.parse(row.result_payload) : null,
      });
    }
  );

  server.tool(
    "list_recent_transactions",
    "List recent transactions initiated through this MCP, optionally filtered by kind.",
    {
      kind: z
        .enum([
          "stk",
          "b2c",
          "b2pochi",
          "b2b",
          "b2b_express",
          "reversal",
          "transaction_status",
          "account_balance",
          "c2b",
        ])
        .optional(),
      limit: z.number().int().positive().max(100).default(20),
    },
    async ({ kind, limit }) => {
      const rows = await listRecentTransactions(kind, limit);
      return text(
        rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          darajaRef: r.daraja_ref,
          amount: r.amount,
          party: r.party,
          status: r.status,
          createdAt: r.created_at,
        }))
      );
    }
  );
}
