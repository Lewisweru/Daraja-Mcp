import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const env = optional("DARAJA_ENV", "sandbox"); // "sandbox" | "production"
const isProd = env === "production";

export const config = {
  env,
  isProd,

  // Base host for the Daraja REST API itself.
  darajaBaseUrl: isProd
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke",

  // Core app credentials (from the Daraja app you created).
  consumerKey: required("DARAJA_CONSUMER_KEY"),
  consumerSecret: required("DARAJA_CONSUMER_SECRET"),

  // Lipa Na M-Pesa Online (STK Push) — your till/paybill + passkey.
  shortcode: required("DARAJA_SHORTCODE"),
  passkey: required("DARAJA_PASSKEY"),
  // "CustomerPayBillOnline" or "CustomerBuyGoodsOnline" — tills use the latter.
  stkTransactionType: optional("DARAJA_STK_TRANSACTION_TYPE", "CustomerBuyGoodsOnline"),

  // B2C/B2B/TransactionStatus/AccountBalance/Reversal — org-level org credentials.
  initiatorName: process.env.DARAJA_INITIATOR_NAME ?? "",
  // Path to the plaintext initiator password's RSA-encrypted form, OR raw
  // password to encrypt at runtime — see src/daraja/security.ts.
  initiatorPassword: process.env.DARAJA_INITIATOR_PASSWORD ?? "",
  certPath: optional("DARAJA_CERT_PATH", isProd ? "certs/production.cer" : "certs/sandbox.cer"),

  // Public base URL of THIS deployed service (Render URL), used to build
  // the callback URLs we register with Daraja.
  callbackBaseUrl: optional("CALLBACK_BASE_URL", "http://localhost:3000"),

  // Endpoint path overrides, in case Safaricom versions an API (e.g. b2c v1 -> v3)
  // without you needing a code change.
  paths: {
    oauth: optional("DARAJA_PATH_OAUTH", "/oauth/v1/generate?grant_type=client_credentials"),
    stkPush: optional("DARAJA_PATH_STK_PUSH", "/mpesa/stkpush/v1/processrequest"),
    stkPushQuery: optional("DARAJA_PATH_STK_QUERY", "/mpesa/stkpushquery/v1/query"),
    c2bRegister: optional("DARAJA_PATH_C2B_REGISTER", "/mpesa/c2b/v1/registerurl"),
    c2bSimulate: optional("DARAJA_PATH_C2B_SIMULATE", "/mpesa/c2b/v1/simulate"),
    b2cPayment: optional("DARAJA_PATH_B2C", "/mpesa/b2c/v1/paymentrequest"),
    b2bPayment: optional("DARAJA_PATH_B2B", "/mpesa/b2b/v1/paymentrequest"),
    transactionStatus: optional("DARAJA_PATH_TXN_STATUS", "/mpesa/transactionstatus/v1/query"),
    accountBalance: optional("DARAJA_PATH_BALANCE", "/mpesa/accountbalance/v1/query"),
    reversal: optional("DARAJA_PATH_REVERSAL", "/mpesa/reversal/v1/request"),
  },

  // --- Safety guard rails for money-OUT tools (b2c, b2b, reversal) ---
  maxTransactionAmount: Number(optional("MAX_TRANSACTION_AMOUNT", "5000")),
  maxDailyAmount: Number(optional("MAX_DAILY_AMOUNT", "20000")),

  port: Number(optional("PORT", "3000")),
  dbPath: optional("DB_PATH", "data/daraja.sqlite"),

  // If set, POST /mcp requires `Authorization: Bearer <token>`. Strongly
  // recommended once this is deployed publicly, since these tools move money.
  mcpBearerToken: process.env.MCP_BEARER_TOKEN ?? "",
};
