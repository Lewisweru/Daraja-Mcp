import axios, { type AxiosInstance } from "axios";
import { config } from "../config.js";
import { getAccessToken } from "./auth.js";

let instance: AxiosInstance | null = null;

/** Axios client pre-wired with the Daraja base URL and a fresh bearer token per request. */
export function darajaClient(): AxiosInstance {
  if (instance) return instance;

  instance = axios.create({ baseURL: config.darajaBaseUrl, timeout: 15_000 });

  instance.interceptors.request.use(async (req) => {
    const token = await getAccessToken();
    req.headers = req.headers ?? {};
    req.headers.Authorization = `Bearer ${token}`;
    return req;
  });

  return instance;
}

/**
 * Axios only gives you the generic HTTP status message by default. Daraja's
 * actual error detail (e.g. {"errorCode":"500.002.1001","errorMessage":"Duplicate
 * OriginatorConversationID."} or {"ResponseDescription": "..."}) is in the response
 * body — surface that instead so failures are actually debuggable.
 */
export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data) {
      const detail =
        typeof data === "string"
          ? data
          : data.errorMessage ?? data.ResponseDescription ?? data.ResultDesc ?? JSON.stringify(data);
      return `Daraja error (HTTP ${err.response?.status}): ${detail}`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export function callbackUrl(path: string): string {
  return `${config.callbackBaseUrl.replace(/\/$/, "")}${path}`;
}

/** Daraja timestamp format: YYYYMMDDHHmmss (Africa/Nairobi is UTC+3, no DST). */
export function darajaTimestamp(date = new Date()): string {
  const nairobi = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    nairobi.getUTCFullYear().toString() +
    pad(nairobi.getUTCMonth() + 1) +
    pad(nairobi.getUTCDate()) +
    pad(nairobi.getUTCHours()) +
    pad(nairobi.getUTCMinutes()) +
    pad(nairobi.getUTCSeconds())
  );
}

/** Normalizes a Kenyan MSISDN to Daraja's expected 2547XXXXXXXX / 2541XXXXXXXX format. */
export function normalizeMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`;
  throw new Error(`Could not normalize phone number "${phone}" to 2547XXXXXXXX / 2541XXXXXXXX format.`);
}
