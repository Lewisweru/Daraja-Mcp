import { readFileSync } from "node:fs";
import { constants, publicEncrypt } from "node:crypto";
import { config } from "../config.js";

/**
 * B2C / B2B / TransactionStatus / AccountBalance / Reversal all require a
 * "SecurityCredential": your initiator password, RSA-encrypted with
 * Safaricom's public certificate (PKCS1 padding), then base64-encoded.
 *
 * Get the cert from the Daraja portal (Sandbox and Production certs differ)
 * and save it at the path in DARAJA_CERT_PATH (defaults to
 * certs/sandbox.cer or certs/production.cer). See README for the download link.
 */
let cached: string | null = null;

export function getSecurityCredential(): string {
  if (cached) return cached;
  if (!config.initiatorPassword) {
    throw new Error(
      "DARAJA_INITIATOR_PASSWORD is not set — required for B2C/B2B/TransactionStatus/AccountBalance/Reversal."
    );
  }

  let cert: Buffer;
  try {
    cert = readFileSync(config.certPath);
  } catch (err) {
    throw new Error(
      `Could not read Safaricom public cert at "${config.certPath}". Download it from the Daraja portal ` +
        `(Docs > B2C / Security Credential) and place it there, or set DARAJA_CERT_PATH. Original error: ${
          (err as Error).message
        }`
    );
  }

  const encrypted = publicEncrypt(
    { key: cert, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(config.initiatorPassword, "utf8")
  );

  cached = encrypted.toString("base64");
  return cached;
}
