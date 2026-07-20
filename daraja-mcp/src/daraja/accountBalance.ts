import { config } from "../config.js";
import { darajaClient, callbackUrl } from "./client.js";
import { getSecurityCredential } from "./security.js";

export async function accountBalance(remarks = "balance check") {
  const body = {
    Initiator: config.initiatorName,
    SecurityCredential: getSecurityCredential(),
    CommandID: "AccountBalance",
    PartyA: config.shortcode,
    IdentifierType: "4",
    Remarks: remarks.slice(0, 100),
    QueueTimeOutURL: callbackUrl("/callbacks/balance/timeout"),
    ResultURL: callbackUrl("/callbacks/balance/result"),
  };
  const res = await darajaClient().post(config.paths.accountBalance, body);
  return res.data;
}
