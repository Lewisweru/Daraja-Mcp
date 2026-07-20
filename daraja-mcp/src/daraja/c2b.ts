import { config } from "../config.js";
import { darajaClient, callbackUrl, normalizeMsisdn } from "./client.js";

export async function c2bRegisterUrls() {
  const body = {
    ShortCode: config.shortcode,
    ResponseType: "Completed",
    ConfirmationURL: callbackUrl("/callbacks/c2b/confirmation"),
    ValidationURL: callbackUrl("/callbacks/c2b/validation"),
  };
  const res = await darajaClient().post(config.paths.c2bRegister, body);
  return res.data;
}

export interface C2bSimulateInput {
  phone: string;
  amount: number;
  billRefNumber: string;
}

/** Sandbox-only: simulates a customer paying your paybill/till from their M-Pesa menu. */
export async function c2bSimulate(input: C2bSimulateInput) {
  if (config.isProd) {
    throw new Error("c2b_simulate is a sandbox-only Daraja API and is rejected in production.");
  }
  const body = {
    ShortCode: config.shortcode,
    CommandID: "CustomerPayBillOnline",
    Amount: Math.round(input.amount),
    Msisdn: normalizeMsisdn(input.phone),
    BillRefNumber: input.billRefNumber,
  };
  const res = await darajaClient().post(config.paths.c2bSimulate, body);
  return res.data;
}
