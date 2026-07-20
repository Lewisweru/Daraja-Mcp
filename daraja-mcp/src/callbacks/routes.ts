import { Router } from "express";
import { logRawCallback, recordResult } from "../store/db.js";

export const callbackRouter = Router();

/** Every Daraja callback gets ack'd with this — anything else and Safaricom retries. */
const ACK = { ResultCode: 0, ResultDesc: "Accepted" };

function ok(res: import("express").Response) {
  res.status(200).json(ACK);
}

// ---- STK Push result ----
callbackRouter.post("/stk", (req, res) => {
  logRawCallback("stk", req.body);
  const cb = req.body?.Body?.stkCallback;
  if (cb?.CheckoutRequestID) {
    const success = cb.ResultCode === 0;
    const items: Array<{ Name: string; Value: unknown }> = cb.CallbackMetadata?.Item ?? [];
    const metadata = Object.fromEntries(items.map((i) => [i.Name, i.Value]));
    recordResult(cb.CheckoutRequestID, success ? "success" : "failed", {
      resultCode: cb.ResultCode,
      resultDesc: cb.ResultDesc,
      ...metadata,
    });
  }
  ok(res);
});

// ---- C2B validation (must respond synchronously; return non-zero to reject a payment) ----
callbackRouter.post("/c2b/validation", (req, res) => {
  logRawCallback("c2b-validation", req.body);
  // Default: accept everything. Add business rules here if you need to reject
  // payments with a bad/missing BillRefNumber, etc.
  ok(res);
});

// ---- C2B confirmation (payment already completed, just record it) ----
callbackRouter.post("/c2b/confirmation", (req, res) => {
  logRawCallback("c2b-confirmation", req.body);
  const body = req.body ?? {};
  if (body.TransID) {
    recordResult(body.TransID, "success", body);
  }
  ok(res);
});

// ---- Generic Result/Timeout handler for B2C, B2B, TransactionStatus, AccountBalance, Reversal ----
function genericResultHandler(route: string) {
  return (req: import("express").Request, res: import("express").Response) => {
    logRawCallback(route, req.body);
    const result = req.body?.Result;
    const ref = result?.ConversationID ?? result?.OriginatorConversationID;
    if (ref) {
      const success = result?.ResultCode === 0;
      const params: Array<{ Key: string; Value: unknown }> = result?.ResultParameters?.ResultParameter ?? [];
      const metadata = Object.fromEntries(params.map((p) => [p.Key, p.Value]));
      recordResult(ref, success ? "success" : "failed", {
        resultCode: result?.ResultCode,
        resultDesc: result?.ResultDesc,
        transactionId: result?.TransactionID,
        ...metadata,
      });
    }
    ok(res);
  };
}

callbackRouter.post("/b2c/result", genericResultHandler("b2c-result"));
callbackRouter.post("/b2c/timeout", genericResultHandler("b2c-timeout"));
callbackRouter.post("/b2b/result", genericResultHandler("b2b-result"));
callbackRouter.post("/b2b/timeout", genericResultHandler("b2b-timeout"));
callbackRouter.post("/transaction-status/result", genericResultHandler("transaction-status-result"));
callbackRouter.post("/transaction-status/timeout", genericResultHandler("transaction-status-timeout"));
callbackRouter.post("/balance/result", genericResultHandler("balance-result"));
callbackRouter.post("/balance/timeout", genericResultHandler("balance-timeout"));
callbackRouter.post("/reversal/result", genericResultHandler("reversal-result"));
callbackRouter.post("/reversal/timeout", genericResultHandler("reversal-timeout"));
