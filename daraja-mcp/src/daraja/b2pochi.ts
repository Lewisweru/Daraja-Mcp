import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { darajaClient, callbackUrl, normalizeMsisdn } from "./client.js";
import { getSecurityCredential } from "./security.js";
import { insertTransaction, setDarajaRef } from "../store/db.js";
import { enforceMoneyOutGuardRails } from "./guardRails.js";

export interface B2PochiInput {
  /** The Pochi la Biashara wallet's phone number, e.g. 254727814888 */
  phone: string;
  amount: number;
  remarks: string;
  occasion?: string;
  confirm: boolean;
}

const MIN_AMOUNT = 10; // Safaricom-enforced minimum for B2Pochi

/**
 * Pays a Pochi la Biashara (micro-SME) business wallet. This is B2C-shaped —
 * PartyB is the wallet's phone number, not a shortcode — but a distinct
 * product from plain B2C: different endpoint, CommandID, and it requires
 * YOU to generate OriginatorConversationID (used by Safaricom to prevent
 * double disbursement) rather than letting Daraja assign one.
 *
 * Note: there is no API reversal for B2Pochi — undoing one requires the
 * M-Pesa portal.
 */
export async function b2Pochi(input: B2PochiInput) {
  await enforceMoneyOutGuardRails({ amount: input.amount, confirm: input.confirm });
  if (input.amount < MIN_AMOUNT) {
    throw new Error(`B2Pochi minimum transaction amount is Ksh ${MIN_AMOUNT}.`);
  }

  const id = randomUUID();
  const phone = normalizeMsisdn(input.phone);

  const body = {
    OriginatorConversationID: id,
    InitiatorName: config.initiatorName,
    SecurityCredential: getSecurityCredential(),
    CommandID: "BusinessPayToPochi",
    Amount: Math.round(input.amount),
    PartyA: config.shortcode,
    PartyB: phone,
    Remarks: input.remarks.slice(0, 100),
    QueueTimeOutURL: callbackUrl("/callbacks/b2pochi/timeout"),
    ResultURL: callbackUrl("/callbacks/b2pochi/result"),
    // Yes, "Occassion" (double s) — that's the field name Safaricom's docs use here too.
    Occassion: (input.occasion ?? "").slice(0, 100),
  };

  await insertTransaction({
    id,
    kind: "b2pochi",
    darajaRef: id, // OriginatorConversationID doubles as our tracking ref until ConversationID arrives
    amount: body.Amount,
    party: phone,
    requestPayload: body,
  });

  const res = await darajaClient().post(config.paths.b2pochi, body);
  const conversationId = res.data?.ConversationID;
  if (conversationId) await setDarajaRef(id, conversationId);

  return { requestId: id, ...res.data };
}
