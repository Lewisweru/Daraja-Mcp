import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { darajaClient, callbackUrl, normalizeMsisdn } from "./client.js";
import { getSecurityCredential } from "./security.js";
import { insertTransaction, setDarajaRef } from "../store/db.js";
import { enforceMoneyOutGuardRails } from "./guardRails.js";

export interface B2cInput {
  phone: string;
  amount: number;
  remarks: string;
  occasion?: string;
  /** "SalaryPayment" | "BusinessPayment" | "PromotionPayment" */
  commandId?: "SalaryPayment" | "BusinessPayment" | "PromotionPayment";
  confirm: boolean;
}

export async function b2cPayment(input: B2cInput) {
  enforceMoneyOutGuardRails({ amount: input.amount, confirm: input.confirm });

  const id = randomUUID();
  const phone = normalizeMsisdn(input.phone);

  const body = {
    InitiatorName: config.initiatorName,
    SecurityCredential: getSecurityCredential(),
    CommandID: input.commandId ?? "BusinessPayment",
    Amount: Math.round(input.amount),
    PartyA: config.shortcode,
    PartyB: phone,
    Remarks: input.remarks.slice(0, 100),
    QueueTimeOutURL: callbackUrl("/callbacks/b2c/timeout"),
    ResultURL: callbackUrl("/callbacks/b2c/result"),
    Occasion: (input.occasion ?? "").slice(0, 100),
  };

  insertTransaction({ id, kind: "b2c", amount: body.Amount, party: phone, requestPayload: body });

  const res = await darajaClient().post(config.paths.b2cPayment, body);
  const conversationId = res.data?.ConversationID;
  if (conversationId) setDarajaRef(id, conversationId);

  return { requestId: id, ...res.data };
}
