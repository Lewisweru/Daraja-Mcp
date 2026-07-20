import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { darajaClient, callbackUrl } from "./client.js";
import { getSecurityCredential } from "./security.js";
import { insertTransaction, setDarajaRef } from "../store/db.js";
import { enforceMoneyOutGuardRails } from "./guardRails.js";

export interface B2bInput {
  receiverShortcode: string;
  amount: number;
  accountReference: string;
  remarks: string;
  /** "BusinessBuyGoods" for a till number, "BusinessPayBill" for a paybill number. */
  commandId?: "BusinessPayBill" | "BusinessBuyGoods";
  /** Optional: consumer's phone number, if paying this merchant on their behalf. */
  requester?: string;
  confirm: boolean;
}

export async function b2bPayment(input: B2bInput) {
  await enforceMoneyOutGuardRails({ amount: input.amount, confirm: input.confirm });

  const id = randomUUID();

  const body = {
    Initiator: config.initiatorName,
    SecurityCredential: getSecurityCredential(),
    CommandID: input.commandId ?? "BusinessBuyGoods",
    SenderIdentifierType: "4",
    RecieverIdentifierType: "4",
    Amount: Math.round(input.amount),
    PartyA: config.shortcode,
    PartyB: input.receiverShortcode,
    AccountReference: input.accountReference.slice(0, 13),
    Requester: input.requester ?? "",
    Remarks: input.remarks.slice(0, 100),
    QueueTimeOutURL: callbackUrl("/callbacks/b2b/timeout"),
    ResultURL: callbackUrl("/callbacks/b2b/result"),
  };

  await insertTransaction({
    id,
    kind: "b2b",
    amount: body.Amount,
    party: input.receiverShortcode,
    requestPayload: body,
  });

  const res = await darajaClient().post(config.paths.b2bPayment, body);
  const conversationId = res.data?.ConversationID;
  if (conversationId) await setDarajaRef(id, conversationId);

  return { requestId: id, ...res.data };
}
