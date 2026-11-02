import { createClient, type Client } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { CheckResult, SignedMemo } from "./memo";
import type { TradeSubject } from "./policy";

export interface StoredReview {
  id: string;
  requestHash: string;
  subject: TradeSubject;
  maximumSpendAtomic: string;
  payer: string;
  network: string;
  gateway: string;
  state: "running" | "recovering" | "complete" | "interrupted";
  createdAt: string;
  updatedAt: string;
  anchorBlock: string | null;
  signed: SignedMemo | null;
  checks: CheckResult[];
  error: string | null;
  reconciliationRequired: boolean;
}

export class ReviewStoreError extends Error {
  constructor(message: string, readonly status: number, readonly recoverRequestId?: string) { super(message); }
}

export function validReviewId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS arcadian_reviews (
    id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, subject TEXT NOT NULL,
    maximum_atomic TEXT NOT NULL, reserved_atomic INTEGER NOT NULL,
    payer TEXT NOT NULL, network TEXT NOT NULL, gateway TEXT NOT NULL,
    state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    anchor_block TEXT, signed TEXT, error TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS arcadian_checks (
    review_id TEXT NOT NULL, intent TEXT NOT NULL, body TEXT NOT NULL,
    PRIMARY KEY (review_id, intent)
  )`,
  `CREATE TABLE IF NOT EXISTS arcadian_wallet_locks (
    wallet TEXT PRIMARY KEY, review_id TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS arcadian_review_writers (
    review_id TEXT PRIMARY KEY, token TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS arcadian_daily_spend ON arcadian_reviews (payer, network, created_at)`,
];

export const REVIEW_WRITER_STALE_MS = 150_000;

function reservation(checks: CheckResult[]): number {
  const seen = new Set<string>();
  let amount = 0n;
  for (const check of checks) {
    if (!check.paymentSubmitted || check.authorizationExpired) continue;
    const key = check.authorizationNonce ?? check.intent;
    if (seen.has(key)) continue;
    seen.add(key);
    if (check.amountAtomic && /^[0-9]+$/.test(check.amountAtomic)) amount += BigInt(check.amountAtomic);
  }
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new ReviewStoreError("The recorded payment amount is outside the storage range", 409);
  return Number(amount);
}

/** The database owns idempotency, wallet exclusion and daily reservations.
 * Locks deliberately do not time out: a lost response may still have spent money.
 */
export class ReviewStore {
  private initialized: Promise<void> | undefined;
  private pending: Promise<unknown> = Promise.resolve();
  private persistentLocal = false;
  constructor(readonly client: Client) {}
  // A local in-memory test database has one connection. Serialize this client's
  // operations; independent clients still arbitrate through database locks.
  private operation<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try { return await action(); }
        catch (error) {
          const code = (error as { code?: string }).code;
          if (this.client.protocol !== "file" || !["SQLITE_BUSY", "SQLITE_LOCKED", "TRANSACTION_ACTIVE"].includes(code ?? "") || attempt >= 8) throw error;
          await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
        } finally {
          // Native libSQL can retain a finished statement's read snapshot on
          // an idle pooled connection. Drop those connections between local
          // file operations so another client can commit or upgrade its
          // snapshot. In-memory databases must keep their sole connection.
          if (this.persistentLocal) await this.client.reconnect();
        }
      }
    });
    this.pending = result.catch(() => {});
    return result;
  }
  initialize(): Promise<void> {
    return this.initialized ??= this.operation(async () => {
      // WAL lets independent local clients read snapshots while a wallet
      // transaction commits. Without it, lingering native read statements can
      // prevent another connection from finishing an otherwise valid write.
      if (this.client.protocol === "file") {
        const mode = await this.client.execute("PRAGMA journal_mode = WAL");
        this.persistentLocal = mode.rows[0]?.journal_mode === "wal";
      }
      await this.client.batch(SCHEMA, "write");
    }).catch(error => {
      this.initialized = undefined;
      throw error;
    });
  }
  async get(id: string): Promise<StoredReview | null> {
    await this.initialize();
    const statements = [
      { sql: "SELECT * FROM arcadian_reviews WHERE id = ?", args: [id] },
      { sql: "SELECT body FROM arcadian_checks WHERE review_id = ? ORDER BY intent", args: [id] },
      { sql: "SELECT review_id FROM arcadian_wallet_locks WHERE review_id = ?", args: [id] },
    ];
    const [result, checks, lock] = await this.operation(async () => {
      if (this.client.protocol !== "file") return this.client.batch(statements, "read");
      // Native libSQL can leave read statements pending after another client
      // updates the schema. Ending a read snapshot with rollback avoids its
      // intermittent "SQL statements in progress" COMMIT failure. These
      // queries are read-only; rollback preserves the same consistent snapshot.
      const tx = await this.client.transaction("read");
      try {
        const results = [];
        for (const statement of statements) results.push(await tx.execute(statement));
        await tx.rollback();
        return results;
      } finally { tx.close(); }
    });
    const r = result.rows[0];
    if (!r) return null;
    return { id: String(r.id), requestHash: String(r.request_hash), subject: JSON.parse(String(r.subject)),
      maximumSpendAtomic: String(r.maximum_atomic), payer: String(r.payer), network: String(r.network), gateway: String(r.gateway),
      state: r.state as StoredReview["state"], createdAt: String(r.created_at), updatedAt: String(r.updated_at),
      anchorBlock: r.anchor_block === null ? null : String(r.anchor_block),
      signed: r.signed === null ? null : JSON.parse(String(r.signed)), error: r.error === null ? null : String(r.error),
      checks: checks.rows.map(row => JSON.parse(String(row.body))), reconciliationRequired: lock.rows.length > 0 };
  }
  async begin(input: { id: string; requestHash: string; subject: TradeSubject; maximumSpendAtomic: bigint;
    dailyLimitAtomic: bigint; payer: string; network: string; gateway: string; now?: number }): Promise<{ started: boolean; writerToken: string | null; review: StoredReview }> {
    if (!validReviewId(input.id)) throw new ReviewStoreError("A paid review needs a UUID v4 requestId", 400);
    if (input.maximumSpendAtomic <= 0n || input.maximumSpendAtomic > 250_000n) throw new ReviewStoreError("A review must have a positive ceiling of at most 0.25 USDC", 400);
    if (input.dailyLimitAtomic <= 0n || input.dailyLimitAtomic > BigInt(Number.MAX_SAFE_INTEGER)) throw new ReviewStoreError("The operator's daily spending limit is invalid", 503);
    await this.initialize();
    const now = new Date(input.now ?? Date.now()).toISOString();
    const day = now.slice(0, 10) + "T00:00:00.000Z";
    const payer = input.payer.toLowerCase();
    const wallet = input.network + ":" + payer;
    let started = false;
    let writerToken: string | null = null;
    await this.operation(async () => {
    started = false;
    writerToken = null;
    const tx = await this.client.transaction("write");
    try {
      const existing = await tx.execute({ sql: "SELECT request_hash FROM arcadian_reviews WHERE id = ?", args: [input.id] });
      if (existing.rows.length) {
        if (existing.rows[0].request_hash !== input.requestHash) throw new ReviewStoreError("This requestId belongs to a different trade or payment configuration", 409);
      } else {
        if (input.maximumSpendAtomic > input.dailyLimitAtomic) throw new ReviewStoreError("The review ceiling exceeds the operator's daily spending limit", 429);
        const lock = await tx.execute({ sql: "SELECT review_id FROM arcadian_wallet_locks WHERE wallet = ?", args: [wallet] });
        if (lock.rows.length) throw new ReviewStoreError("Recover review " + lock.rows[0].review_id + " before authorizing another review from this wallet", 409, String(lock.rows[0].review_id));
        const tomorrow = new Date(Date.parse(day) + 86_400_000).toISOString();
        const spend = await tx.execute({ sql: "SELECT COALESCE(SUM(reserved_atomic), 0) AS total FROM arcadian_reviews WHERE payer = ? AND network = ? AND created_at >= ? AND created_at < ?", args: [payer, input.network, day, tomorrow] });
        if (BigInt(String(spend.rows[0].total)) + input.maximumSpendAtomic > input.dailyLimitAtomic) throw new ReviewStoreError("The operator's daily intelligence spending limit has been reached", 429);
        await tx.execute({ sql: `INSERT INTO arcadian_reviews
          (id, request_hash, subject, maximum_atomic, reserved_atomic, payer, network, gateway, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
          args: [input.id, input.requestHash, JSON.stringify(input.subject), input.maximumSpendAtomic.toString(), Number(input.maximumSpendAtomic), payer, input.network, input.gateway, now, now] });
        await tx.execute({ sql: "INSERT INTO arcadian_wallet_locks (wallet, review_id) VALUES (?, ?)", args: [wallet, input.id] });
        writerToken = randomUUID();
        await tx.execute({ sql: "INSERT INTO arcadian_review_writers (review_id, token, updated_at) VALUES (?, ?, ?)", args: [input.id, writerToken, now] });
        started = true;
      }
      await tx.commit();
    } finally { tx.close(); }
    });
    return { started, writerToken, review: (await this.get(input.id))! };
  }

  private async write<T>(id: string, token: string, action: (tx: Awaited<ReturnType<Client["transaction"]>>) => Promise<T>): Promise<T> {
    await this.initialize();
    return this.operation(async () => {
    const tx = await this.client.transaction("write");
    try {
      const owner = await tx.execute({ sql: "SELECT token FROM arcadian_review_writers WHERE review_id = ?", args: [id] });
      if (owner.rows[0]?.token !== token) throw new ReviewStoreError("This review is being recovered by another request; reload its recorded state", 409);
      const now = new Date().toISOString();
      await tx.execute({ sql: "UPDATE arcadian_review_writers SET updated_at = ? WHERE review_id = ?", args: [now, id] });
      await tx.execute({ sql: "UPDATE arcadian_reviews SET updated_at = ? WHERE id = ?", args: [now, id] });
      const result = await action(tx);
      await tx.commit();
      return result;
    } finally { tx.close(); }
    });
  }

  async claimRecovery(id: string, now = Date.now()): Promise<{ writerToken: string | null; review: StoredReview }> {
    await this.initialize();
    let writerToken: string | null = null;
    await this.operation(async () => {
    const tx = await this.client.transaction("write");
    try {
      const found = await tx.execute({ sql: "SELECT state, updated_at FROM arcadian_reviews WHERE id = ?", args: [id] });
      const review = found.rows[0];
      if (!review) throw new ReviewStoreError("Review not found", 404);
      const owner = await tx.execute({ sql: "SELECT updated_at FROM arcadian_review_writers WHERE review_id = ?", args: [id] });
      const lastWrite = Date.parse(String(owner.rows[0]?.updated_at ?? review.updated_at));
      if (!(["running", "recovering"].includes(String(review.state)) && now - lastWrite < REVIEW_WRITER_STALE_MS)) {
        writerToken = randomUUID();
        const timestamp = new Date(now).toISOString();
        await tx.execute({ sql: `INSERT INTO arcadian_review_writers (review_id, token, updated_at) VALUES (?, ?, ?)
          ON CONFLICT (review_id) DO UPDATE SET token = excluded.token, updated_at = excluded.updated_at`, args: [id, writerToken, timestamp] });
        await tx.execute({ sql: "UPDATE arcadian_reviews SET state = 'recovering', updated_at = ? WHERE id = ?", args: [timestamp, id] });
      }
      await tx.commit();
    } finally { tx.close(); }
    });
    return { writerToken, review: (await this.get(id))! };
  }

  async anchor(id: string, block: bigint, token: string): Promise<void> {
    await this.write(id, token, async tx => {
      await tx.execute({ sql: "UPDATE arcadian_reviews SET anchor_block = ? WHERE id = ?", args: [block.toString(), id] });
    });
  }
  async saveCheck(id: string, check: CheckResult, token: string): Promise<void> {
    await this.write(id, token, async tx => {
      await tx.execute({ sql: `INSERT INTO arcadian_checks (review_id, intent, body) VALUES (?, ?, ?)
        ON CONFLICT (review_id, intent) DO UPDATE SET body = excluded.body`, args: [id, check.intent, JSON.stringify(check)] });
    });
  }
  async finish(id: string, signed: SignedMemo, token: string): Promise<StoredReview> {
    await this.write(id, token, async tx => {
      for (const check of signed.memo.checks) await tx.execute({ sql: `INSERT INTO arcadian_checks (review_id, intent, body) VALUES (?, ?, ?)
        ON CONFLICT (review_id, intent) DO UPDATE SET body = excluded.body`, args: [id, check.intent, JSON.stringify(check)] });
      const reserved = reservation(signed.memo.checks);
      await tx.execute({ sql: "UPDATE arcadian_reviews SET state = 'complete', signed = ?, error = NULL, reserved_atomic = ?, updated_at = ? WHERE id = ?",
        args: [JSON.stringify(signed), reserved, new Date().toISOString(), id] });
      if (signed.memo.cost.unsettledUsdc === "0") await tx.execute({ sql: "DELETE FROM arcadian_wallet_locks WHERE review_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM arcadian_review_writers WHERE review_id = ?", args: [id] });
    });
    return (await this.get(id))!;
  }
  async interrupt(id: string, reason: string, token: string): Promise<StoredReview> {
    await this.write(id, token, async tx => {
      const recorded = await tx.execute({ sql: "SELECT body FROM arcadian_checks WHERE review_id = ?", args: [id] });
      const checks: CheckResult[] = recorded.rows.map(r => JSON.parse(String(r.body)));
      const reserved = reservation(checks);
      await tx.execute({ sql: "UPDATE arcadian_reviews SET state = 'interrupted', error = ?, reserved_atomic = ?, updated_at = ? WHERE id = ?",
        args: [reason, reserved, new Date().toISOString(), id] });
      if (!checks.some(c => c.paymentSubmitted && !c.paid && !c.authorizationExpired)) await tx.execute({ sql: "DELETE FROM arcadian_wallet_locks WHERE review_id = ?", args: [id] });
      await tx.execute({ sql: "DELETE FROM arcadian_review_writers WHERE review_id = ?", args: [id] });
    });
    return (await this.get(id))!;
  }
}

export function reviewStorageConfigured(): boolean {
  return storageUrl() !== null;
}

function storageUrl(): URL | null {
  const configured = process.env.REVIEW_DB_URL?.trim();
  if (!configured || configured === "file::memory:") return null;
  try {
    const url = new URL(configured, "file:" + process.cwd() + "/");
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol === "file:") {
      if (process.env.VERCEL || url.host || !configured.startsWith("file:") || !url.pathname || url.pathname.endsWith("/") || url.pathname.endsWith("/:memory:")) return null;
      fileURLToPath(url);
      return url;
    }
    return ["libsql:", "https:"].includes(url.protocol) && url.hostname && process.env.REVIEW_DB_AUTH_TOKEN?.trim() ? url : null;
  } catch { return null; }
}

export async function configuredReviewStore(): Promise<ReviewStore> {
  const url = storageUrl();
  if (!url) throw new ReviewStoreError("Configure durable review storage before authorizing payments", 503);
  if (url.protocol === "file:") await mkdir(dirname(fileURLToPath(url)), { recursive: true });
  return new ReviewStore(createClient({ url: url.href, ...(url.protocol !== "file:" ? { authToken: process.env.REVIEW_DB_AUTH_TOKEN!.trim() } : {}) }));
}
