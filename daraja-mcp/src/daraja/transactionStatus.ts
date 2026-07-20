import { config } from "../config.js";
import { darajaClient, callbackUrl } from "./client.js";
import { getSecurityCredential } from "./security.js";

export async function transactionStatus(transactionId: string, remarks = "status check") {
  const body = {
    Initiator: config.initiatorName,
    SecurityCredential: getSecurityCredential(),
    CommandID: "TransactionStatusQuery",
    TransactionID: transactionId,
    PartyA: config.shortcode,
    IdentifierType: "4",
    ResultURL: callbackUrl("/callbacks/transaction-status/result"),
    QueueTimeOutURL: callbackUrl("/callbacks/transaction-status/timeout"),
    Remarks: remarks.slice(0, 100),
    Occasion: "",
  };
  const res = await darajaClient().post(config.paths.transactionStatus, body);
  return res.data;
}
