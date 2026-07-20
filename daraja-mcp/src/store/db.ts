import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { config } from "../config.js";

mkdirSync(dirname(config.dbPath), { recursive: true });
const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,             -- our own request id (idempotency key)
    kind TEXT NOT NULL,              -- 'stk' | 'b2c' | 'b2b' | 'reversal' | 'transaction_status' | 'account_balance' | 'c2b'
    daraja_ref TEXT,                 -- CheckoutRequestID / ConversationID / OriginatorConversationID
    amount REAL,
    party TEXT,                      -- phone number / shortcode this concerns
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'failed'
    request_payload TEXT,
    result_payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_daraja_ref ON transactions(daraja_ref);
  CREATE INDEX IF NOT EXISTS idx_transactions_kind_created ON transactions(kind, created_at);

  CREATE TABLE IF NOT EXISTS raw_callbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route TEXT NOT NULL,
    body TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export interface TransactionRow {
  id: string;
  kind: string;
  daraja_ref: string | null;
  amount: number | null;
  party: string | null;
  status: "pending" | "success" | "failed";
  request_payload: string | null;
  result_payload: string | null;
  created_at: string;
  updated_at: string;
}

export function insertTransaction(row: {
  id: string;
  kind: string;
  darajaRef?: string;
  amount?: number;
  party?: string;
  requestPayload: unknown;
}) {
  db.prepare(
    `INSERT INTO transactions (id, kind, daraja_ref, amount, party, request_payload)
     VALUES (@id, @kind, @darajaRef, @amount, @party, @requestPayload)`
  ).run({
    id: row.id,
    kind: row.kind,
    darajaRef: row.darajaRef ?? null,
    amount: row.amount ?? null,
    party: row.party ?? null,
    requestPayload: JSON.stringify(row.requestPayload),
  });
}

export function setDarajaRef(id: string, darajaRef: string) {
  db.prepare(`UPDATE transactions SET daraja_ref = ?, updated_at = datetime('now') WHERE id = ?`).run(
    darajaRef,
    id
  );
}

export function recordResult(
  darajaRef: string,
  status: "success" | "failed",
  resultPayload: unknown
) {
  db.prepare(
    `UPDATE transactions
     SET status = ?, result_payload = ?, updated_at = datetime('now')
     WHERE daraja_ref = ?`
  ).run(status, JSON.stringify(resultPayload), darajaRef);
}

export function getTransaction(id: string): TransactionRow | undefined {
  return db.prepare(`SELECT * FROM transactions WHERE id = ? OR daraja_ref = ?`).get(id, id) as
    | TransactionRow
    | undefined;
}

export function listRecentTransactions(kind: string | undefined, limit: number): TransactionRow[] {
  if (kind) {
    return db
      .prepare(`SELECT * FROM transactions WHERE kind = ? ORDER BY created_at DESC LIMIT ?`)
      .all(kind, limit) as TransactionRow[];
  }
  return db.prepare(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?`).all(limit) as TransactionRow[];
}

/** Sum of successful+pending money-out (b2c/b2b) amounts today — used for the daily cap guard rail. */
export function todaysOutboundTotal(): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE kind IN ('b2c', 'b2b')
         AND status != 'failed'
         AND date(created_at) = date('now')`
    )
    .get() as { total: number };
  return row.total;
}

export function logRawCallback(route: string, body: unknown) {
  db.prepare(`INSERT INTO raw_callbacks (route, body) VALUES (?, ?)`).run(route, JSON.stringify(body));
}

export default db;
