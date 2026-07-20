import axios from "axios";
import { config } from "../config.js";

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cached: CachedToken | null = null;

/**
 * Returns a valid OAuth2 access token, fetching a fresh one from Daraja
 * only when the cached one is missing or about to expire. Daraja tokens
 * live ~3600s; we refresh 2 minutes early to avoid races.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - now > 120_000) {
    return cached.token;
  }

  const basic = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const url = `${config.darajaBaseUrl}${config.paths.oauth}`;

  const res = await axios.get(url, {
    headers: { Authorization: `Basic ${basic}` },
  });

  const token = res.data?.access_token;
  const expiresIn = Number(res.data?.expires_in ?? 3599);
  if (!token) {
    throw new Error(`Daraja OAuth response missing access_token: ${JSON.stringify(res.data)}`);
  }

  cached = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}
