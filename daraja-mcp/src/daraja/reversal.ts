import { config } from "../config.js";
import { darajaClient, callbackUrl } from "./client.js";
import { getSecurityCredential } from "./security.js";
import { enforceMoneyOutGuardRails } from "./guardRails.js";

export interface ReversalInput {
  transactionId: string;
  amount: number;
  remarks: string;
  occasion?: string;
  confirm: boolean;
}

export async function reversal(input: ReversalInput) {
  enforceMoneyOutGuardRails({ amount: input.amount, confirm: input.confirm });

  const body = {
    Initiator: config.initiatorName,
    SecurityCredential: getSecurityCredential(),
    CommandID: "TransactionReversal",
    TransactionID: input.transactionId,
    Amount: Math.round(input.amount),
    ReceiverParty: config.shortcode,
    RecieverIdentifierType: "4",
    ResultURL: callbackUrl("/callbacks/reversal/result"),
    QueueTimeOutURL: callbackUrl("/callbacks/reversal/timeout"),
    Remarks: input.remarks.slice(0, 100),
    Occasion: (input.occasion ?? "").slice(0, 100),
  };
  const res = await darajaClient().post(config.paths.reversal, body);
  return res.data;
}
