import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { configuredReviewStore, reviewStorageConfigured, ReviewStore, REVIEW_WRITER_STALE_MS } from "./store";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { subject, signer, net, confirmedChecks, now } from "./test-support";
import { assembleMemo, signMemo } from "./memo";

const input = (id = randomUUID()) => ({ id, requestHash: "hash", subject, payer: signer.address,
  network: net.name, gateway: "https://gw.test/engine", maximumSpendAtomic: 50_000n, dailyLimitAtomic: 100_000n, now });

test("a stored request is idempotent and locks the payer until interruption is resolved", async () => {
  const store = new ReviewStore(createClient({ url: "file::memory:" }));
  try {
    const request = input();
    const claim = await store.begin(request);
    assert.equal(claim.started, true);
    assert.equal((await store.begin(request)).started, false);
    await assert.rejects(store.begin({ ...request, requestHash: "changed" }), /different trade/);
    await assert.rejects(store.begin(input()), /Recover review/);
    await store.interrupt(request.id, "No payment was authorized", claim.writerToken!);
    assert.equal((await store.begin(input())).started, true);
  } finally { store.client.close(); }
});

test("uncertain payments retain the wallet lock and daily reservation", async () => {
  const store = new ReviewStore(createClient({ url: "file::memory:" }));
  try {
    const request = input();
    const claim = await store.begin(request);
    const checks = confirmedChecks();
    checks[0].paid = false;
    const review = await store.finish(request.id, await signMemo(assembleMemo(subject, checks, net, now), signer, net), claim.writerToken!);
    assert.equal(review.reconciliationRequired, true);
    assert.equal(review.signed!.memo.cost.unsettledUsdc, "0.01");
    await assert.rejects(store.begin(input()), /Recover review/);
    checks[0].authorizationExpired = true;
    const recovery = await store.claimRecovery(request.id);
    await store.finish(request.id, await signMemo(assembleMemo(subject, checks, net, now), signer, net), recovery.writerToken!);
    assert.equal((await store.get(request.id))!.reconciliationRequired, false);
  } finally { store.client.close(); }
});

test("completed payments count against the daily limit after the lock is released", async () => {
  const store = new ReviewStore(createClient({ url: "file::memory:" }));
  try {
    const request = input();
    const claim = await store.begin(request);
    await store.finish(request.id, await signMemo(assembleMemo(subject, confirmedChecks(), net, now), signer, net), claim.writerToken!);
    await assert.rejects(store.begin({ ...input(), maximumSpendAtomic: 70_000n }), /daily intelligence/);
    assert.equal((await store.begin({ ...input(), maximumSpendAtomic: 60_000n })).started, true);
  } finally { store.client.close(); }
});

test("separate database clients retain authorizations after a crash and fence stale writers during recovery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "arcadian-journal-"));
  const url = pathToFileURL(join(directory, "reviews.db")).href;
  const first = new ReviewStore(createClient({ url }));
  const second = new ReviewStore(createClient({ url }));
  let reopened: ReviewStore | undefined;
  try {
    await Promise.all([first.initialize(), second.initialize()]);
    const request = input();
    const claim = await first.begin(request);
    const check = confirmedChecks()[0];
    check.paid = false;
    await first.saveCheck(request.id, check, claim.writerToken!);
    assert.equal((await second.begin(request)).started, false);
    await assert.rejects(second.begin(input()), /Recover review/);
    const activeTime = Date.parse((await second.get(request.id))!.updatedAt);
    assert.equal((await second.claimRecovery(request.id, activeTime + 1000)).writerToken, null);
    first.client.close();
    reopened = new ReviewStore(createClient({ url }));
    assert.equal((await reopened.get(request.id))!.checks[0].authorizationNonce, check.authorizationNonce);
    const recoveredAt = activeTime + REVIEW_WRITER_STALE_MS + 1000;
    const recovery = await reopened.claimRecovery(request.id, recoveredAt);
    assert.ok(recovery.writerToken);
    assert.equal((await second.claimRecovery(request.id, recoveredAt + 1000)).writerToken, null);
    await assert.rejects(second.saveCheck(request.id, { ...check, paid: true }, claim.writerToken!), /being recovered/);
    await assert.rejects(second.interrupt(request.id, "late interrupt", claim.writerToken!), /being recovered/);
    await reopened.interrupt(request.id, "Payment remains unresolved", recovery.writerToken!);
    await assert.rejects(second.begin(input()), /Recover review/);
    assert.equal((await second.get(request.id))!.checks[0].paid, false);
  } finally {
    if (!first.client.closed) first.client.close();
    second.client.close();
    reopened?.client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("simultaneous clients cannot authorize two reviews from the same wallet", async () => {
  const directory = await mkdtemp(join(tmpdir(), "arcadian-concurrent-"));
  const url = pathToFileURL(join(directory, "reviews.db")).href;
  const clients = [new ReviewStore(createClient({ url })), new ReviewStore(createClient({ url }))];
  try {
    await Promise.all(clients.map(c => c.initialize()));
    for (let attempt = 0; attempt < 12; attempt++) {
      const outcomes = await Promise.allSettled(clients.map(c => c.begin(input())));
      assert.equal(outcomes.filter(r => r.status === "fulfilled" && r.value.started).length, 1);
      const rejected = outcomes.filter(r => r.status === "rejected") as PromiseRejectedResult[];
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.status, 409, "The loser must receive a wallet conflict, not a storage error");
      const winnerIndex = outcomes.findIndex(r => r.status === "fulfilled");
      const winner = (outcomes[winnerIndex] as PromiseFulfilledResult<Awaited<ReturnType<ReviewStore["begin"]>>>).value;
      assert.equal(rejected[0].reason.recoverRequestId, winner.review.id);
      assert.equal((await clients[1 - winnerIndex].get(winner.review.id))!.reconciliationRequired, true);
      await clients[winnerIndex].interrupt(winner.review.id, "No payment was authorized", winner.writerToken!);
    }
  } finally {
    clients.forEach(c => c.client.close());
    await rm(directory, { recursive: true, force: true });
  }
});

test("configured storage rejects volatile URLs and reopens a nested SQLite file", async () => {
  const previous = { url: process.env.REVIEW_DB_URL, token: process.env.REVIEW_DB_AUTH_TOKEN, vercel: process.env.VERCEL };
  const directory = await mkdtemp(join(tmpdir(), "arcadian-factory-"));
  try {
    delete process.env.VERCEL;
    for (const url of ["file::memory:", "file:", "file:./:memory:", "https://", "libsql://user:password@host"]) {
      process.env.REVIEW_DB_URL = url;
      assert.equal(reviewStorageConfigured(), false, url);
    }
    process.env.REVIEW_DB_URL = pathToFileURL(join(directory, "nested", "reviews.db")).href;
    assert.equal(reviewStorageConfigured(), true);
    const store = await configuredReviewStore();
    const request = input();
    await store.begin(request);
    store.client.close();
    const reopened = await configuredReviewStore();
    assert.equal((await reopened.get(request.id))!.requestHash, request.requestHash);
    reopened.client.close();
    process.env.VERCEL = "1";
    assert.equal(reviewStorageConfigured(), false);
    process.env.REVIEW_DB_URL = "libsql://example.turso.io";
    delete process.env.REVIEW_DB_AUTH_TOKEN;
    assert.equal(reviewStorageConfigured(), false);
    process.env.REVIEW_DB_AUTH_TOKEN = "operator-fixture";
    assert.equal(reviewStorageConfigured(), true);
  } finally {
    for (const [key, value] of Object.entries({ REVIEW_DB_URL: previous.url, REVIEW_DB_AUTH_TOKEN: previous.token, VERCEL: previous.vercel })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
