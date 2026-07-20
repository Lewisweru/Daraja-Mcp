import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { darajaClient, callbackUrl, darajaTimestamp, normalizeMsisdn } from "./client.js";
import { insertTransaction, setDarajaRef } from "../store/db.js";

export interface StkPushInput {
  phone: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

export async function stkPush(input: StkPushInput) {
  const id = randomUUID();
  const phone = normalizeMsisdn(input.phone);
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");

  const body = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: config.stkTransactionType,
    Amount: Math.round(input.amount),
    PartyA: phone,
    PartyB: config.tillNumber,
    PhoneNumber: phone,
    CallBackURL: callbackUrl("/callbacks/stk"),
    AccountReference: input.accountReference.slice(0, 12),
    TransactionDesc: input.transactionDesc.slice(0, 13),
  };

  await insertTransaction({ id, kind: "stk", amount: body.Amount, party: phone, requestPayload: body });

  const res = await darajaClient().post(config.paths.stkPush, body);
  const checkoutRequestId = res.data?.CheckoutRequestID;
  if (checkoutRequestId) await setDarajaRef(id, checkoutRequestId);

  return { requestId: id, ...res.data };
}

export async function stkPushQuery(checkoutRequestId: string) {
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${config.shortcode}${config.passkey}${timestamp}`).toString("base64");

  const body = {
    BusinessShortCode: config.shortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await darajaClient().post(config.paths.stkPushQuery, body);
  return res.data;
}
