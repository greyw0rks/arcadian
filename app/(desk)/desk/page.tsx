"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { TRADE_CHAINS, TRADE_INTENTS, type TradeSubject } from "@/agent/policy";
import type { SignedMemo } from "@/agent/memo";
import styles from "./desk.module.css";

interface DeskResponse {
  ok: boolean;
  state: "configured" | "setup_required" | "preview" | "verified" | "incomplete" | "error" | "running" | "recovering" | "interrupted";
  reason?: string;
  recoverRequestId?: string;
  network?: { name: string; chainId: number; testnet: boolean; explorer: string };
  config?: { payer: string | null; gatewayConfigured: boolean; payerConfigured: boolean; spendingProtected: boolean };
  plan?: { subject: TradeSubject; intents: string[]; maximumSpendUsdc: string };
  memo?: SignedMemo;
  review?: { id: string; state: string; reconciliationRequired: boolean; checks: SignedMemo["memo"]["checks"] };
}
const CHECKS = [
  ["Contract security", "Honeypots, owner controls, blocked sells and drainer logic."],
  ["Trading integrity", "Artificial volume and circular trading between related wallets."],
  ["Onchain state", "The token's identity and current contract state on the selected chain."],
  ["Executable liquidity", "Depth available for the proposed trade size."],
];
const PAYMENT_LABELS: Record<number, string> = {
  11155111: "Ethereum Sepolia · Telegraph test USDC",
  84532: "Base Sepolia · Test USDC",
  8453: "Base · Mainnet USDC",
};
function short(value: string) { return value.length > 20 ? value.slice(0, 10) + "…" + value.slice(-6) : value; }

export default function DeskPage() {
  const [ready, setReady] = useState<DeskResponse | null>(null);
  const [address, setAddress] = useState("0x4200000000000000000000000000000000000006");
  const [chain, setChain] = useState("Base");
  const [notional, setNotional] = useState("1000");
  const [budget, setBudget] = useState("0.05");
  const [accessToken, setAccessToken] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [transactions, setTransactions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<"preview" | "paid" | "recover" | null>(null);
  const [result, setResult] = useState<DeskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const requestRunning = useRef(false);

  useEffect(() => {
    try { setReviewId(sessionStorage.getItem("arcadian-review-v1") ?? ""); } catch { /* Manual recovery remains available. */ }
    const controller = new AbortController();
    fetch("/api/desk", { signal: controller.signal }).then(r => r.json()).then(setReady)
      .catch(() => { if (!controller.signal.aborted) setError("Connection failed. Reload to check payment readiness."); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (result || error) resultsRef.current?.focus({ preventScroll: true }); }, [result, error]);

  function rememberReview(id: string) {
    setReviewId(id);
    try { if (id) sessionStorage.setItem("arcadian-review-v1", id); else sessionStorage.removeItem("arcadian-review-v1"); } catch { /* The response still carries the ID. */ }
  }

  async function run(preview: boolean) {
    if (requestRunning.current) return;
    requestRunning.current = true;
    setLoading(preview ? "preview" : "paid");
    setError(null);
    if (preview) setResult(null);
    try {
      const id = preview ? undefined : crypto.randomUUID();
      if (id) rememberReview(id);
      const response = await fetch("/api/desk", {
        method: "POST",
        headers: { "content-type": "application/json", ...(preview ? {} : { "x-desk-token": accessToken }) },
        body: JSON.stringify({ subject: { tokenAddress: address.trim(), chain, notionalUsd: Number(notional) },
          maximumSpendUsdc: budget, preview, requestId: id }),
      });
      const data: DeskResponse = await response.json();
      if (!response.ok && !data.plan) setError(data.reason ?? "The review failed. Inspect any recorded payment before retrying.");
      if (!preview && !response.ok && response.status < 500) rememberReview("");
      if (data.recoverRequestId) rememberReview(data.recoverRequestId);
      if (data.review) rememberReview(data.review.id);
      setResult(data);
    } catch {
      setError("The connection ended before the review returned. Check the payment ledger before retrying a paid request.");
    } finally { requestRunning.current = false; setLoading(null); }
  }
  async function recover() {
    if (requestRunning.current) return;
    requestRunning.current = true;
    setLoading("recover");
    setError(null);
    try {
      const response = await fetch("/api/desk/reconcile", { method: "POST",
        headers: { "content-type": "application/json", "x-desk-token": accessToken },
        body: JSON.stringify({ requestId: reviewId.trim(), transactions: Object.fromEntries(
          Object.entries(transactions).filter(([, hash]) => hash.trim()).map(([intent, hash]) => [intent, hash.trim()])) }) });
      const data: DeskResponse = await response.json();
      if (!response.ok) {
        setError(data.reason ?? "Recovery failed. The review remains recorded.");
        if (response.status === 404) rememberReview("");
      } else { rememberReview(data.review!.id); setResult(data); }
    } catch { setError("Recovery could not reach the server. Keep the review ID and try recovery again."); }
    finally { requestRunning.current = false; setLoading(null); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(true);
  }
  function downloadMemo() {
    if (!result?.memo) return;
    const blob = new Blob([JSON.stringify(result.memo, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "arcadian-trade-memo.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  const net = result?.network ?? ready?.network;
  const memo = result?.memo?.memo;
  const configured = ready?.state === "configured";
  const recoveryPending = Boolean(reviewId && (!result?.review || result.review.reconciliationRequired));
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.navigation}>
          <Link href="/" className={styles.brand}>ARCADIAN<span className={styles.brandDot} aria-hidden="true" /></Link>
          <nav aria-label="Project navigation">
            <Link href="/verify">Verify a memo</Link>
            <Link href="/">Pool research</Link>
          </nav>
        </header>

        <div className={styles.titleRow}>
          <div>
            <h1 className="techno">Pre-trade risk gate</h1>
            <p>Check the evidence before committing capital. Arcadian buys intelligence through Telegraph and returns a decision with its cost attached.</p>
          </div>
          <span className={styles.state}>{configured ? "Operator settings configured" : ready ? "Payment setup required" : "Checking operator settings"}</span>
        </div>

        <aside className={styles.boundary} aria-label="Execution boundary">
          <strong>{net ? PAYMENT_LABELS[net.chainId] ?? net.name : "Checking payment network"}</strong>
          <span>Intelligence payments are separate from the trading chain. This gate produces a decision; trade execution stays with the operator.</span>
        </aside>

        <div className={styles.workspace}>
          <section className={styles.formPanel} aria-labelledby="proposed-trade">
            <h2 id="proposed-trade">Proposed trade</h2>
            <p className={styles.help}>Use a contract address so the checks refer to the same token.</p>
            <form onSubmit={submit} ref={formRef}>
              <label htmlFor="token-address">Token contract</label>
              <input id="token-address" name="tokenAddress" value={address} onChange={e => setAddress(e.target.value)} autoComplete="off" spellCheck={false} required pattern="0x[0-9a-fA-F]{40}" aria-describedby="address-help" />
              <p id="address-help" className={styles.fieldHelp}>Use the exact token contract on the selected chain. The starting example is WETH on Base.</p>

              <div className={styles.fieldRow}>
                <div>
                  <label htmlFor="trading-chain">Trading chain</label>
                  <select id="trading-chain" value={chain} onChange={e => setChain(e.target.value)}>
                    {TRADE_CHAINS.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="notional">Trade size · USD</label>
                  <input id="notional" type="number" min="0.01" max="100000000" step="0.01" value={notional} onChange={e => setNotional(e.target.value)} required />
                </div>
              </div>

              <div className={styles.budgetGroup}>
                <label htmlFor="intelligence-budget">Maximum intelligence spend · USDC</label>
                <input id="intelligence-budget" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,6})?" value={budget} onChange={e => setBudget(e.target.value)} required aria-describedby="budget-help" />
                <p id="budget-help" className={styles.fieldHelp}>Shared across four checks. A price above the remaining ceiling is declined before signing.</p>
              </div>

              <button className={styles.previewButton} type="submit" disabled={Boolean(loading)}>{loading === "preview" ? "Preparing request plan…" : "Preview request plan"}</button>

              <details className={styles.operator}>
                <summary>Operator access for paid reviews</summary>
                <label htmlFor="access-token">Access token</label>
                <input id="access-token" type="password" autoComplete="off" value={accessToken} onChange={e => setAccessToken(e.target.value)} />
                <p className={styles.fieldHelp}>Provided by the deployment operator. Kept in this tab only.</p>
              </details>
              <button className={styles.paidButton} type="button" disabled={Boolean(loading) || !configured || !accessToken || recoveryPending} onClick={() => { if (formRef.current?.reportValidity()) void run(false); }}>
                {loading === "paid" ? "Buying and verifying intelligence…" : "Buy checks and review trade"}
              </button>
              {!configured ? <p className={styles.setupHelp}>{ready?.reason ?? "Checking payment configuration…"}</p> : <p className={styles.setupHelp}>Paid runs use the configured agent wallet. Enter operator access to enable spending.</p>}
              <details className={styles.operator} open={recoveryPending || undefined}>
                <summary>Recover a recorded review</summary>
                <label htmlFor="review-id">Review ID</label>
                <input id="review-id" autoComplete="off" spellCheck={false} value={reviewId} onChange={e => { setReviewId(e.target.value); setTransactions({}); }} />
                <p className={styles.fieldHelp}>Check existing payments after a disconnect. Recovery reads the ledger and chain; it buys no new intelligence.</p>
                <details className={styles.transactionRecovery}>
                  <summary>Supply known settlement transactions</summary>
                  <p className={styles.fieldHelp}>Optional when a payment is too old to locate automatically. A single batch transaction can cover several checks; each authorization is verified separately.</p>
                  {TRADE_INTENTS.map((intent, index) => <div key={intent}>
                    <label htmlFor={"settlement-" + index}>{CHECKS[index][0]} transaction</label>
                    <input id={"settlement-" + index} autoComplete="off" spellCheck={false} placeholder="0x…" value={transactions[intent] ?? ""}
                      pattern="0x[0-9a-fA-F]{64}" onChange={e => setTransactions(current => ({ ...current, [intent]: e.target.value }))} />
                  </div>)}
                </details>
                <button className={styles.recoverButton} type="button" disabled={Boolean(loading) || !reviewId || !accessToken} onClick={() => void recover()}>{loading === "recover" ? "Checking recorded payments…" : "Recover review"}</button>
              </details>
            </form>
          </section>

          <section className={styles.checkPanel} aria-labelledby="required-evidence">
            <h2 id="required-evidence">Required evidence</h2>
            <p className={styles.help}>All four checks must be current, tied to this token, and verified before the gate can proceed.</p>
            <ol className={styles.checkList}>
              {CHECKS.map(([title, description], index) => (
                <li key={title}>
                  <div className={styles.checkNumber} aria-hidden="true">{index + 1}</div>
                  <div><h3>{title}</h3><p>{description}</p><code>{TRADE_INTENTS[index]}</code></div>
                </li>
              ))}
            </ol>
            <div className={styles.policySummary}>
              <h3>The decision policy</h3>
              <p>Security and trading risk at most 20/100. Confidence at least 80%. Evidence at most five minutes old. Trade size at most 1% of verified executable depth.</p>
              <p>Missing evidence holds the trade for review. A malicious contract finding blocks it.</p>
            </div>
          </section>
        </div>

        <section className={styles.results} ref={resultsRef} tabIndex={-1} aria-label="Trade review results" aria-live="polite" aria-busy={Boolean(loading)}>
          {error ? <div className={styles.error} role="alert"><strong>Review could not complete</strong><p>{error}</p></div> : null}
          {loading ? <p className={styles.loading}>{loading === "paid" ? "Requests are running. Keep this tab open while payment and evidence are checked." : loading === "recover" ? "Checking the stored review and its existing payment authorizations." : "Preparing the request plan. No payment will be sent."}</p> : null}
          {result?.review && !memo ? <div className={styles.plan}><h2>Review recorded</h2><p>{result.reason}</p><p><code>{result.review.id}</code></p>{result.review.checks.length ? <p>{result.review.checks.length} check records are retained. Recover this review to reconcile them.</p> : null}</div> : null}
          {result?.plan && !memo ? (
            <div className={styles.plan}>
              <h2>{result.state === "preview" ? "Request plan ready" : "Paid reviews need setup"}</h2>
              <p>{result.reason}</p>
              <dl><div><dt>Token</dt><dd><code>{result.plan.subject.tokenAddress}</code></dd></div><div><dt>Trading chain</dt><dd>{result.plan.subject.chain}</dd></div><div><dt>Proposed size</dt><dd>{result.plan.subject.notionalUsd.toLocaleString()} USD</dd></div><div><dt>Spend ceiling</dt><dd>{result.plan.maximumSpendUsdc} USDC across {result.plan.intents.length} checks</dd></div></dl>
            </div>
          ) : null}
          {memo ? (
            <>
              <div className={styles.decision} data-decision={memo.verdict}>
                <div><h2>{memo.verdict === "PROCEED" ? "Policy passed" : memo.verdict === "BLOCK" ? "Block this trade" : memo.verdict === "NO_DATA" ? "No usable evidence" : "Hold for review"}</h2><p>{result?.reason}</p></div>
                <span className={styles.decisionTag}>{memo.verdict}</span>
                <ul>{memo.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
              </div>
              <div className={styles.evidence}>
                <h2>Purchased intelligence</h2>
                {memo.checks.map(check => (
                  <article key={check.intent}>
                    <div className={styles.findingHeader}><h3>{check.intent.replaceAll("_", " ").toLowerCase()}</h3><span>{check.error ? "Incomplete" : "Verified purchase"}</span></div>
                    <p>{check.finding || check.error || "No finding returned."}</p>
                    {check.error && check.finding ? <p className={styles.checkError}>{check.error}</p> : null}
                    {check.observation?.limitations?.length ? <p>{check.observation.limitations.join(" ")}</p> : null}
                    <div className={styles.attribution}>Provider {check.minerName}{check.rank ? " · rank " + check.rank : " · rank unavailable"}{check.signalLink ? <> · <a href={check.signalLink} target="_blank" rel="noreferrer">{check.signalVerified ? "Inspect recorded signal" : "Inspect reported signal"}</a></> : null}</div>
                    {check.rawResult !== undefined ? <details className={styles.rawEvidence}><summary>Inspect raw provider response</summary><pre>{JSON.stringify(check.rawResult, null, 2)}</pre></details> : null}
                  </article>
                ))}
              </div>
              <div className={styles.ledger}>
                <div className={styles.ledgerHeader}><h2>Intelligence spend</h2><strong>{memo.cost.totalUsdc} USDC confirmed</strong></div>
                <p>{memo.cost.verifiedReceiptCount} consumption receipts · {memo.cost.settledTxCount} unique settlement transactions. {memo.cost.unsettledUsdc} USDC authorized but unconfirmed.{memo.cost.expiredUsdc !== "0" ? " " + memo.cost.expiredUsdc + " USDC expired unused." : ""}</p>
                {result?.review ? <p>Review ID <code>{result.review.id}</code>{result.review.reconciliationRequired ? " · Recover these payments before authorizing another review." : ""}</p> : null}
                <div className={styles.tableScroll} role="region" aria-label="Payment ledger" tabIndex={0}>
                  <table><thead><tr><th>Check / provider</th><th>USDC</th><th>Payment</th><th>Settlement / receipt</th></tr></thead>
                    <tbody>{memo.cost.lineItems.map((item, index) => <tr key={index}><td><span>{item.intent}</span><small>{item.miner}</small></td><td>{item.amountUsdc}</td><td>{item.paymentStatus.replace("_", " ")}</td><td>{item.txLink ? <a href={item.txLink} target="_blank" rel="noreferrer">{short(item.txHash!)}</a> : "No transaction"}{item.receiptHash ? <small>{short(item.receiptHash)}</small> : <small>No consumption receipt</small>}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
              <div className={styles.memoFooter}>
                <p>Agent signature proves authorship and integrity. It does not establish validator consensus or guarantee a safe trade.</p>
                <button type="button" onClick={downloadMemo}>Download signed memo</button>
                <details><summary>Inspect agent signature</summary><code>Signer: {result!.memo!.signer}<br />Memo: {result!.memo!.memoHash}<br />Signature: {result!.memo!.signature}</code></details>
              </div>
            </>
          ) : !result && !loading ? <p className={styles.empty}>Your decision and spend ledger appear here after a review. Preview the plan to inspect the request without spending.</p> : null}
        </section>
        <footer className={styles.footer}><span>Arcadian · Telegraph Season II · Apps & Agents</span><a href="https://hackathon.telegraphprotocol.com/missions/web3-defi" target="_blank" rel="noreferrer">Mission 14</a><a href="https://docs.telegraphprotocol.com/docs/using/engine-ask" target="_blank" rel="noreferrer">Supported Engine flow</a></footer>
      </div>
    </main>
  );
}
