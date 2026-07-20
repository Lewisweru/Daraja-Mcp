import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { darajaClient, callbackUrl } from "./client.js";
import { insertTransaction } from "../store/db.js";

export interface B2bExpressCheckoutInput {
  /** The OTHER business's till number being asked to pay (debit party). */
  primaryShortCode: string;
  amount: number;
  /** Shown to the merchant as the payment reference. */
  paymentRef: string;
  /** Your business's friendly name, shown to the merchant on the USSD prompt. */
  partnerName: string;
  /** Your paybill being credited. Defaults to your configured shortcode. */
  receiverShortCode?: string;
}

/**
 * B2B Express Checkout (USSD Push to Till). This COLLECTS money — it debits
 * another business's till and credits yours — so unlike b2c_payment/b2b_payment
 * it doesn't need the confirm-before-send guard rail. The other merchant still
 * has to approve it themselves (enters their Operator ID + PIN on their phone),
 * so nothing moves without their action either way.
 */
export async function b2bExpressCheckout(input: B2bExpressCheckoutInput) {
  const requestId = randomUUID();

  const body = {
    primaryShortCode: input.primaryShortCode,
    receiverShortCode: input.receiverShortCode ?? config.shortcode,
    amount: Math.round(input.amount),
    paymentRef: input.paymentRef,
    callbackUrl: callbackUrl("/callbacks/b2b-express/result"),
    partnerName: input.partnerName,
    RequestRefID: requestId,
  };

  insertTransaction({
    id: requestId,
    kind: "b2b_express",
    darajaRef: requestId,
    amount: body.amount,
    party: input.primaryShortCode,
    requestPayload: body,
  });

  const res = await darajaClient().post(config.paths.b2bExpressCheckout, body);
  return { requestId, ...res.data };
}
