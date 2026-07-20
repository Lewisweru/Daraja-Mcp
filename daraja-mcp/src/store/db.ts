import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Query } from "firebase-admin/firestore";
import { config } from "../config.js";

if (!getApps().length) {
  const serviceAccount = JSON.parse(readFileSync(config.firebaseServiceAccountPath, "utf8"));
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const transactionsCol = db.collection("transactions");
const rawCallbacksCol = db.collection("raw_callbacks");

/** Kinds that move money OUT of your account — counted toward the daily cap. */
const MONEY_OUT_KINDS = ["b2c", "b2b", "b2pochi"];

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

export async function insertTransaction(row: {
  id: string;
  kind: string;
  darajaRef?: string;
  amount?: number;
  party?: string;
  requestPayload: unknown;
}): Promise<void> {
  const now = new Date().toISOString();
  const doc: TransactionRow = {
    id: row.id,
    kind: row.kind,
    daraja_ref: row.darajaRef ?? null,
    amount: row.amount ?? null,
    party: row.party ?? null,
    status: "pending",
    request_payload: JSON.stringify(row.requestPayload),
    result_payload: null,
    created_at: now,
    updated_at: now,
  };
  await transactionsCol.doc(row.id).set(doc);
}

export async function setDarajaRef(id: string, darajaRef: string): Promise<void> {
  await transactionsCol.doc(id).set(
    { daraja_ref: darajaRef, updated_at: new Date().toISOString() },
    { merge: true }
  );
}

export async function recordResult(
  darajaRef: string,
  status: "success" | "failed",
  resultPayload: unknown
): Promise<void> {
  // Try direct doc lookup first (covers b2b_express/b2pochi, which use their own
  // generated id as the initial ref), then fall back to querying by daraja_ref.
  const byId = await transactionsCol.doc(darajaRef).get();
  const target = byId.exists
    ? byId.ref
    : (await transactionsCol.where("daraja_ref", "==", darajaRef).limit(1).get()).docs[0]?.ref;
  if (!target) return;
  await target.set(
    { status, result_payload: JSON.stringify(resultPayload), updated_at: new Date().toISOString() },
    { merge: true }
  );
}

export async function getTransaction(id: string): Promise<TransactionRow | undefined> {
  const byId = await transactionsCol.doc(id).get();
  if (byId.exists) return byId.data() as TransactionRow;
  const byRef = await transactionsCol.where("daraja_ref", "==", id).limit(1).get();
  if (!byRef.empty) return byRef.docs[0].data() as TransactionRow;
  return undefined;
}

/**
 * Filters/sorts in-memory rather than with Firestore where()+orderBy() on
 * different fields, deliberately — that combination needs a manual composite
 * index in Firestore, which would make the first real call fail. At this
 * project's scale (a single till's transaction volume) this is plenty fast.
 */
export async function listRecentTransactions(kind: string | undefined, limit: number): Promise<TransactionRow[]> {
  if (kind) {
    const snap = await transactionsCol.where("kind", "==", kind).limit(500).get();
    const rows = snap.docs.map((d) => d.data() as TransactionRow);
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    return rows.slice(0, limit);
  }
  const q: Query = transactionsCol.orderBy("created_at", "desc").limit(limit);
  const snap = await q.get();
  return snap.docs.map((d) => d.data() as TransactionRow);
}

/** Sum of successful+pending money-out (b2c/b2b/b2pochi) amounts today — used for the daily cap guard rail. */
export async function todaysOutboundTotal(): Promise<number> {
  const startOfDayIso = new Date(new Date().toDateString()).toISOString();
  const snap = await transactionsCol.where("kind", "in", MONEY_OUT_KINDS).get();
  let total = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as TransactionRow;
    if (data.status !== "failed" && data.created_at >= startOfDayIso) {
      total += data.amount ?? 0;
    }
  }
  return total;
}

export async function logRawCallback(route: string, body: unknown): Promise<void> {
  await rawCallbacksCol.add({ route, body: JSON.stringify(body), received_at: new Date().toISOString() });
}
