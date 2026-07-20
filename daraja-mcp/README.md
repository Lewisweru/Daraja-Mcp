# daraja-mcp

An MCP server exposing Safaricom's M-Pesa Daraja API as tools Claude can call from a chat message — STK Push, C2B, B2C, B2B, Transaction Status, Account Balance, and Reversal — plus the callback receiver Daraja needs to report results back to.

One Node/TypeScript service, two route groups:
- `POST /mcp` — the MCP endpoint Claude connects to (Streamable HTTP, stateless).
- `POST /callbacks/*` — where Safaricom sends async results. Written to Firestore.

## Tools

| Tool | What it does |
|---|---|
| `stk_push` | Prompt a customer's phone for their PIN to pay you |
| `stk_push_query` | Poll an STK Push by CheckoutRequestID |
| `c2b_register_urls` | One-time: register this service's callback URLs with your shortcode |
| `c2b_simulate` | Sandbox-only: simulate a customer paying your paybill/till |
| `b2c_payment` | Send money out to a customer (refund/payout/salary) — **requires `confirm:true`** |
| `b2pochi_payment` | Send money out to a Pochi la Biashara wallet by phone number — **requires `confirm:true`** |
| `b2b_payment` | Send money out to another business's paybill/till — **requires `confirm:true`** |
| `b2b_express_checkout` | Request payment IN from another till via USSD push (they approve on their end) |
| `pull_transactions_register` | One-time: register for the Pull Transactions reconciliation API |
| `pull_transactions_query` | List C2B transactions received in a date range (last 48h only) |
| `transaction_status` | Look up any past transaction by ID |
| `account_balance` | Check your shortcode's balance |
| `reversal` | Reverse a completed transaction — **requires `confirm:true`** |
| `check_transaction_result` | Read back the stored callback result for a transaction |
| `list_recent_transactions` | List recent transactions initiated through this server |

`b2c_payment`, `b2pochi_payment`, `b2b_payment`, and `reversal` also enforce `MAX_TRANSACTION_AMOUNT` and `MAX_DAILY_AMOUNT` server-side, and reject the call outright if `confirm` isn't `true` — so Claude can't fire these off without you explicitly confirming amount + recipient in the conversation first.

## Local setup

```bash
npm install
cp .env.example .env   # fill in your sandbox keys
npm run dev
```

For local testing of callbacks you'll need a public tunnel (e.g. `ngrok http 3000`) and to set `CALLBACK_BASE_URL` to the ngrok URL before registering/using anything that expects a callback.

### Getting the Safaricom public certificate (needed for B2C/B2B/TransactionStatus/AccountBalance/Reversal)

These all require a `SecurityCredential` — your initiator password RSA-encrypted with Safaricom's public cert. Download the cert for your environment from the Daraja portal docs (Docs → search "Security Credential" / "B2C") and save it at:
- `certs/sandbox.cer` for sandbox
- `certs/production.cer` for production

(or point `DARAJA_CERT_PATH` at wherever you put it). `DARAJA_INITIATOR_PASSWORD` is the plaintext password for your initiator/API operator — it gets encrypted at request time, never sent or stored in plaintext.

### Getting the Firebase service account key

The store is Firestore, via `firebase-admin`. That needs a **service account key**, not the client-side web config (`apiKey`/`authDomain`/etc. from `firebase/app`) — that config is for browser apps and won't authenticate a server. To get the right one:

1. Firebase console → your project → gear icon → Project Settings → **Service Accounts** tab.
2. Click "Generate new private key" → downloads a JSON file.
3. Save it locally at `certs/firebase-service-account.json` (already gitignored).
4. Make sure Firestore itself is enabled for the project (console → Build → Firestore Database → Create database, if you haven't already — Native mode, any region).

## Deploying to Render

This repo includes `render.yaml` (Render "Blueprint"):

1. Push this repo to GitHub.
2. In Render: New → Blueprint → point at the repo. It reads `render.yaml` and creates the web service — no persistent disk needed since Firestore holds the data.
3. Fill in the env vars marked `sync: false` in the Render dashboard: `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_TILL_NUMBER`, `DARAJA_PASSKEY`, `DARAJA_INITIATOR_NAME`, `DARAJA_INITIATOR_PASSWORD`, `MCP_BEARER_TOKEN`.
4. Upload two Secret Files (Render dashboard → Environment → Secret Files): the Daraja cert as `production.cer`, and the Firebase key as `firebase-service-account.json`. `render.yaml` already points `DARAJA_CERT_PATH`/`FIREBASE_SERVICE_ACCOUNT_PATH` at `/etc/secrets/...`, which is where Render mounts them.
5. After the first deploy, copy the Render URL (e.g. `https://daraja-mcp.onrender.com`) into `CALLBACK_BASE_URL` and redeploy — callback URLs are built from this at request time, so it must be set before you use anything that receives a callback.
6. Call `c2b_register_urls` once (from Claude, or `curl`) to register validation/confirmation URLs with your shortcode.
7. You'll also need to submit this server's outbound IP to Safaricom for whitelisting (ask Render support for your service's static outbound IP, or add a static-IP add-on) before B2C/B2B/B2Pochi/Reversal will work in production.

### Keeping the free tier awake

`plan: free` on Render sleeps the service after ~15 min idle and takes 30-50s to wake — risky for Safaricom's callback timeout window. Point an external pinger (UptimeRobot or similar) at `https://<your-render-url>/healthz` every 5-10 min to keep it warm. If you'd rather not depend on that, switch `plan: free` to `plan: starter` in `render.yaml` (~$7/mo, no sleeping).

## Connecting Claude to it

This is a remote MCP server (Streamable HTTP), so add it wherever your Claude client supports remote MCP servers, pointing at:

```
https://<your-render-url>/mcp
```

Set `MCP_BEARER_TOKEN` (generate one with `openssl rand -hex 32`) before going live — Claude's MCP config needs an `Authorization: Bearer <token>` header matching it, otherwise `POST /mcp` returns 401. Leaving it blank is fine for local dev only; a public URL with no token means anyone who finds it can call these tools.

## Safety notes

- Sandbox first: even with production keys ready, run each tool against `DARAJA_ENV=sandbox` before flipping to production.
- `MAX_TRANSACTION_AMOUNT` / `MAX_DAILY_AMOUNT` default to 5,000 / 20,000 KES — adjust in your env vars to whatever's appropriate for your till.
- The confirm-before-send pattern only works if Claude is instructed (via its system prompt / your own usage) not to set `confirm:true` without you explicitly saying the amount and recipient out loud in chat — the tool descriptions say this, but it's not a hard technical guarantee.
