"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { TRADE_CHAINS } from "@/agent/policy";
import type { MemoVerification } from "@/agent/verify";
import styles from "../desk/desk.module.css";
import local from "./verify.module.css";

export default function VerifyPage() {
  const [memoText, setMemoText] = useState("");
  const [trustedSigner, setTrustedSigner] = useState("");
  const [address, setAddress] = useState("0x4200000000000000000000000000000000000006");
  const [chain, setChain] = useState("Base");
  const [notional, setNotional] = useState("1000");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MemoVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const running = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/desk/verify", { signal: controller.signal }).then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.trustedSigner) setTrustedSigner(current => current || data.trustedSigner); }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => { if (result || error) resultsRef.current?.focus({ preventScroll: true }); }, [result, error]);
  function change(setter: (value: string) => void, value: string) { setter(value); setResult(null); setError(null); }
  async function loadFile(file?: File) {
    setResult(null); setError(null); setMemoText("");
    if (!file) return;
    if (file.size > 250_000) { setError("Choose a signed memo smaller than 250 KB."); return; }
    try { const text = await file.text(); JSON.parse(text); setMemoText(text); }
    catch { setError("This file is not valid JSON. Choose the signed memo downloaded from the trade desk."); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    running.current = true; setLoading(true); setError(null); setResult(null);
    try {
      if (!memoText.trim()) throw new Error("Choose a signed memo or paste its JSON.");
      const memo = JSON.parse(memoText);
      const response = await fetch("/api/desk/verify", { method: "POST", signal: AbortSignal.timeout(55_000),
        headers: { "content-type": "application/json" }, body: JSON.stringify({ memo, trustedSigner: trustedSigner.trim(),
          subject: { tokenAddress: address.trim(), chain, notionalUsd: Number(notional) } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.reason ?? "Verification could not complete. Hold the trade and try again.");
      setResult(data);
    } catch (failure) { setError(failure instanceof SyntaxError ? "The pasted memo is not valid JSON." : failure instanceof Error ? failure.message : "Verification failed. Hold the trade."); }
    finally { running.current = false; setLoading(false); }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "arcadian-verification.json"; a.click(); URL.revokeObjectURL(url);
  }
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.navigation}>
      <Link href="/desk" className={styles.brand}>ARCADIAN<span className={styles.brandDot} aria-hidden="true" /></Link>
      <nav aria-label="Project navigation"><Link href="/desk">Trade desk</Link><Link href="/">Pool research</Link></nav>
    </header>
    <div className={styles.titleRow}><div><h1 className="techno">Check the proof before you sign.</h1>
      <p>Recheck a downloaded trade memo against the token, chain and amount you intend to trade.</p></div><span className={styles.state}>Read-only verification</span></div>
    <aside className={styles.boundary}><strong>No wallet connection needed</strong><span>Verification reads existing payments and intelligence records. A current decision must match your proposed trade.</span></aside>
    <div className={styles.workspace}>
      <section className={styles.formPanel} aria-labelledby="verify-input"><h2 id="verify-input">Your proposed trade</h2>
        <form onSubmit={submit}>
          <fieldset className={local.fields} disabled={loading}>
            <label htmlFor="verify-address">Token contract</label><input id="verify-address" name="tokenAddress" value={address} onChange={e => change(setAddress, e.target.value)} spellCheck={false} autoComplete="off" required pattern="0x[0-9a-fA-F]{40}" />
            <div className={styles.fieldRow}><div><label htmlFor="verify-chain">Trading chain</label><select id="verify-chain" value={chain} onChange={e => change(setChain, e.target.value)}>{TRADE_CHAINS.map(c => <option key={c.id}>{c.name}</option>)}</select></div>
              <div><label htmlFor="verify-usd">Trade size · USD</label><input id="verify-usd" type="number" min="0.01" max="100000000" step="0.01" value={notional} onChange={e => change(setNotional, e.target.value)} required /></div></div>
            <div className={styles.budgetGroup}><label htmlFor="trusted-signer">Trusted operator address</label><input id="trusted-signer" value={trustedSigner} onChange={e => change(setTrustedSigner, e.target.value)} spellCheck={false} autoComplete="off" required pattern="0x[0-9a-fA-F]{40}" aria-describedby="signer-help" />
              <p className={styles.fieldHelp} id="signer-help">Confirm this address with the operator. The address inside a memo cannot establish trust by itself.</p></div>
            <div className={styles.budgetGroup}><label htmlFor="memo-file">Signed memo file</label><input id="memo-file" type="file" accept=".json,application/json" onChange={e => void loadFile(e.target.files?.[0])} /></div>
            <details className={styles.operator}><summary>Paste signed memo JSON</summary><label htmlFor="memo-json">Memo JSON</label>
              <textarea id="memo-json" className={local.json} value={memoText} maxLength={250_000} onChange={e => change(setMemoText, e.target.value)} spellCheck={false} /></details>
            <button type="submit" className={styles.previewButton}>{loading ? "Checking signature and network proof…" : "Verify memo"}</button>
          </fieldset>
        </form>
      </section>
      <section className={styles.checkPanel} aria-labelledby="verification-scope"><h2 id="verification-scope">What gets checked</h2>
        <ol className={styles.checkList}>{[
          ["Trusted authorship", "The signature and memo hash match the operator address you trust."],
          ["The exact trade", "The token, trading chain and USD notional match your inputs."],
          ["Payment and intelligence", "Each authorization, USDC transfer, consumption receipt and recorded answer is rechecked."],
          ["Current decision", "Raw observations meet the policy now. Stale, altered or incomplete evidence holds the trade."],
        ].map(([title, text], i) => <li key={title}><span className={styles.checkNumber}>{i + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
        <div className={styles.policySummary}><h3>For traders and agents</h3><p>Download the report for your records. Agents can use the same verifier before acting on a memo. Trade execution remains with the operator.</p><p>Testnet proof establishes a testnet result. A passing policy does not guarantee a safe trade.</p></div>
      </section>
    </div>
    <section className={styles.results} ref={resultsRef} tabIndex={-1} aria-live="polite" aria-busy={loading} aria-label="Memo verification result">
      {loading ? <p className={styles.loading}>Reading the existing settlement and signal records…</p> : null}
      {error ? <div className={styles.error} role="alert"><strong>Hold the trade</strong><p>{error}</p></div> : null}
      {result ? <>
        <div className={styles.decision} data-decision={result.decision}><div><h2>{result.canProceed ? "Current proof passes" : result.decision === "BLOCK" ? "Block this trade" : "Hold for review"}</h2>
          <p>{result.signatureVerified ? "Trusted signature verified." : "Signature could not be verified."} {result.evidenceVerified ? "Payment and intelligence evidence verified." : "Evidence is incomplete."}</p></div>
          <span className={styles.decisionTag}>{result.decision}</span><ul>{result.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul></div>
        {result.checks.length ? <div className={styles.evidence}><h2>Rechecked evidence</h2>{result.checks.map(check => <article key={check.intent}>
          <h3 className={local.intent}>{check.intent.replaceAll("_", " ")}</h3><p>Payment {check.paymentVerified ? "verified" : "unverified"} · Receipt {check.receiptVerified ? "matched" : "unmatched"} · Signal {check.signalVerified ? "matched" : "unmatched"}</p>
          {check.issues.length ? <p className={styles.checkError}>{check.issues.join(" ")}</p> : null}</article>)}</div> : null}
        {result.cost ? <div className={styles.ledger}><h2>Independently verified spend</h2><p>{result.cost.totalUsdc} USDC · {result.cost.verifiedReceiptCount} consumption receipts · {result.cost.settledTxCount} unique settlement transactions</p></div> : null}
        <div className={styles.memoFooter}><p>Checked {new Date(result.verifiedAt).toLocaleString()}. Approval expires when its evidence does.</p><button type="button" onClick={download}>Download verification</button></div>
      </> : !loading && !error ? <p className={styles.empty}>Download a signed memo from the trade desk, then load it here to inspect the proof.</p> : null}
    </section>
    <footer className={styles.footer}><span>Arcadian · Telegraph Season II · Apps & Agents</span><Link href="/desk">Open the trade desk</Link></footer>
  </div></main>;
}
