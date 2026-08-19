"use client";

import { useEffect, useState } from "react";

interface RiskComponents {
  [key: string]: number;
}

interface RankedRow {
  protocol: string;
  risk_score: number;
  verdict: string;
  apy: number;
  tvl_usd: number;
  tvl_k: number;
  confidence: number;
  components: RiskComponents;
  flags: string[];
  symbol: string;
  pools_scored: number;
  pools_available: number;
}

interface RiskResponse {
  mode?: string;
  chain: string;
  asset?: string;
  safest?: string;
  ranked?: RankedRow[];
  protocols_scanned?: number;
  pools_scanned?: number;
  risk_score: number;
  verdict: string;
  apy_bps: number;
  tvl_k: number;
  confidence: number;
  components: RiskComponents;
  flags: string[];
  explanation: string;
  protocol: string;
  symbol: string;
  pool_id: string;
  data_sources?: string[];
  suggestions?: string[];
  query?: { chain?: string; asset?: string };
  error?: string;
}

interface ChainOption { chain: string; pools: number; tvlUsd: number }
interface AssetOption { asset: string; pools: number; tvlUsd: number }

const VERDICTS: Record<string, { color: string; label: string }> = {
  LOW_RISK:       { color: "#2E7D32", label: "LOW RISK" },
  MEDIUM_RISK:    { color: "#B8860B", label: "MEDIUM RISK" },
  HIGH_RISK:      { color: "#C62828", label: "HIGH RISK" },
  VERY_HIGH_RISK: { color: "#7F1010", label: "VERY HIGH RISK" },
};

const EXAMPLES = [
  { label: "ETHEREUM · USDC",  body: { chain: "Ethereum", asset: "USDC" } },
  { label: "BASE · USDC",      body: { chain: "Base",     asset: "USDC" } },
  { label: "ETHEREUM · WETH",  body: { chain: "Ethereum", asset: "WETH" } },
  { label: "ARBITRUM · USDT",  body: { chain: "Arbitrum", asset: "USDT" } },
];

const COMPONENTS = [
  { key: "apy_credibility",   label: "APY CREDIBILITY",    max: 20 },
  { key: "liquidity_depth",   label: "LIQUIDITY DEPTH",    max: 20 },
  { key: "exploit_history",   label: "EXPLOIT HISTORY",    max: 20 },
  { key: "protocol_maturity", label: "PROTOCOL MATURITY",  max: 20 },
  { key: "concentration",     label: "CONCENTRATION / IL", max: 10 },
  { key: "reward_token",      label: "REWARD TOKEN",       max: 10 },
];

const METHODOLOGY = [
  { n: "01", label: "APY CREDIBILITY",    pts: "0–20", desc: "Sigma (30d std-dev), outlier flag, reward ratio. Source: DefiLlama Pools." },
  { n: "02", label: "LIQUIDITY DEPTH",    pts: "0–20", desc: "TVL tiers + 30d TVL drawdown. Source: DefiLlama History." },
  { n: "03", label: "EXPLOIT HISTORY",    pts: "0–20", desc: "589 real hacks matched by protocol, recency-weighted. Source: DefiLlama Hacks." },
  { n: "04", label: "PROTOCOL MATURITY",  pts: "0–20", desc: "Age since listing, audit count, fork status. Source: DefiLlama Protocols." },
  { n: "05", label: "CONCENTRATION / IL", pts: "0–10", desc: "LP vs single-asset, stablecoin vs volatile IL exposure." },
  { n: "06", label: "REWARD TOKEN",       pts: "0–10", desc: "Market-cap rank + 30d price volatility. Source: CoinGecko." },
];

const NAV = ["SCORER", "METHODOLOGY", "API", "TELEGRAPH"];
const SOURCES = ["DEFILLAMA", "COINGECKO", "TELEGRAPH", "BASE"];

/* ─── Primitives ─── */

const ORANGE = "#FF7120";
const INK = "#0A0A0A";
const LINE = "#C4C4B8";

function Marker({ style }: { style?: React.CSSProperties }) {
  return <div style={{ position: "absolute", width: 7, height: 7, background: ORANGE, ...style }} />;
}

// Box with orange corner squares at all four corners
function Framed({ children, style, pad = 24 }: { children: React.ReactNode; style?: React.CSSProperties; pad?: number }) {
  return (
    <div style={{ position: "relative", border: `1px solid ${INK}`, background: "#FCFCF7", padding: pad, ...style }}>
      <Marker style={{ top: -4, left: -4 }} />
      <Marker style={{ top: -4, right: -4 }} />
      <Marker style={{ bottom: -4, left: -4 }} />
      <Marker style={{ bottom: -4, right: -4 }} />
      {children}
    </div>
  );
}

function Kicker({ children, color = ORANGE }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <div style={{ width: 7, height: 7, background: color }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", color: INK }}>{children}</span>
    </div>
  );
}

const SELECT_STYLE: React.CSSProperties = {
  width: "100%", border: `1px solid ${INK}`, background: "#EFEFE5",
  padding: "10px 30px 10px 12px", fontSize: 13, fontFamily: "Roboto Mono, monospace",
  color: INK, appearance: "none", borderRadius: 0, cursor: "pointer",
};

function Caret() {
  return (
    <span style={{
      position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)",
      color: ORANGE, fontSize: 10, pointerEvents: "none",
    }}>▼</span>
  );
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function RiskBar({ label, value, max }: { label: string; value: number; max: number }) {
  const ratio = value / max;
  const pct = ratio * 100;
  const color = ratio <= 0.3 ? "#2E7D32" : ratio <= 0.65 ? "#B8860B" : "#C62828";
  const segments = max; // one tick per point
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, letterSpacing: "0.06em" }}>
        <span style={{ color: "#3A3A3A", fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, color: INK }}>
          {value.toString().padStart(2, "0")}<span style={{ color: "#9E9E9E", fontWeight: 400 }}>/{max}</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 2, height: 12 }}>
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} style={{
            flex: 1,
            background: i < value ? color : "#DFDFD3",
            border: `1px solid ${i < value ? color : "#CFCFC3"}`,
          }} />
        ))}
      </div>
    </div>
  );
}

function ScoreGauge({ score, verdict }: { score: number; verdict: string }) {
  const v = VERDICTS[verdict] ?? VERDICTS.MEDIUM_RISK;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <rect x="4" y="4" width="122" height="122" fill="none" stroke="#DFDFD3" strokeWidth="1" />
      <circle cx="65" cy="65" r={r} fill="none" stroke="#DFDFD3" strokeWidth="8" />
      <circle
        cx="65" cy="65" r={r} fill="none" stroke={v.color} strokeWidth="8"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 65 65)"
        style={{ transition: "stroke-dashoffset 0.7s ease" }}
      />
      <text x="65" y="60" textAnchor="middle" fill={INK} fontSize="30" fontWeight="700" fontFamily="Orbitron, monospace">{score}</text>
      <text x="65" y="80" textAnchor="middle" fill="#9E9E9E" fontSize="10" fontFamily="Roboto Mono, monospace">/ 100</text>
    </svg>
  );
}

const GRID_BG =
  "linear-gradient(#D6D6CC 1px, transparent 1px), linear-gradient(90deg, #D6D6CC 1px, transparent 1px)";

/* ─── Page ─── */

export default function Home() {
  const [chain,   setChain]   = useState("Ethereum");
  const [asset,   setAsset]   = useState("USDC");
  const [chains,  setChains]  = useState<ChainOption[]>([]);
  const [assets,  setAssets]  = useState<AssetOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<RiskResponse | null>(null);

  // Load the chain list once, then the asset suggestions for whichever chain is
  // picked. Suggestions only — the asset field is free text, so whatever the user
  // typed is left alone when the chain changes.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/telegraph/universe?chain=${encodeURIComponent(chain)}`)
      .then(r => r.json())
      .then((d: { chains?: ChainOption[]; assets?: AssetOption[] }) => {
        if (cancelled) return;
        if (d.chains?.length) setChains(d.chains);
        setAssets(d.assets ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chain]);

  async function query(body: object) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/telegraph/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setResult(await res.json());
    } catch {
      setResult({ error: "REQUEST FAILED" } as unknown as RiskResponse);
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const a = asset.trim().toUpperCase();
    if (!a) return;
    query({ chain, asset: a });
  }

  const v = result?.verdict ? (VERDICTS[result.verdict] ?? VERDICTS.MEDIUM_RISK) : null;
  const tvlStr = result
    ? result.tvl_k >= 1000 ? `$${(result.tvl_k / 1000).toFixed(1)}M` : `$${result.tvl_k}K`
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#EFEFE5" }}>

      {/* ── Top nav ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px", borderBottom: `1px solid ${INK}`,
        background: "#EFEFE5", position: "sticky", top: 0, zIndex: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, background: ORANGE, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 10, height: 10, background: "#EFEFE5" }} />
          </div>
          <div style={{ lineHeight: 1 }}>
            <div className="techno" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.02em" }}>ARCADIAN</div>
            <div style={{ fontSize: 8, letterSpacing: "0.22em", color: "#787878", marginTop: 2 }}>RISK ORACLE</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 26 }}>
          {NAV.map(n => (
            <a key={n} href="#" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", color: INK, textDecoration: "none" }}>{n}</a>
          ))}
        </nav>
        <button style={{
          background: ORANGE, color: "#fff", border: `1px solid ${INK}`,
          padding: "8px 18px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
        }}>SCORE NOW</button>
      </header>

      {/* ── Hero ── */}
      <section style={{ position: "relative", borderBottom: `1px solid ${INK}`, overflow: "hidden" }}>
        {/* blueprint grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: GRID_BG, backgroundSize: "48px 48px",
          opacity: 0.5, pointerEvents: "none",
        }} />
        {/* corner markers */}
        <Marker style={{ top: 14, left: 14 }} />
        <Marker style={{ top: 14, right: 14 }} />

        <div style={{ position: "relative", padding: "34px 28px 0" }}>
          {/* Giant techno headline */}
          <div className="techno" style={{
            fontWeight: 900,
            fontSize: "clamp(52px, 13vw, 168px)",
            lineHeight: 0.88,
            letterSpacing: "-0.03em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            color: INK,
          }}>
            RISK ORACLE
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 8 }}>
            <div style={{ width: 7, height: 7, background: ORANGE }} />
            <span style={{ fontSize: 11, letterSpacing: "0.2em", color: "#787878" }}>VERIFIABLE</span>
            <span style={{ fontSize: 11, letterSpacing: "0.2em", color: "#787878" }}>ON-CHAIN</span>
            <span style={{ fontSize: 11, letterSpacing: "0.2em", color: "#787878" }}>DEFI SIGNAL</span>
          </div>
        </div>

        {/* hero lower band */}
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: `1px solid ${LINE}`, marginTop: 20 }}>
          <div style={{ padding: "26px 28px", borderRight: `1px solid ${LINE}` }}>
            <p style={{ fontSize: 14, lineHeight: 1.7, maxWidth: 440, color: "#2A2A2A" }}>
              Scoring the very best — and worst — DeFi protocols. A Telegraph Miner that
              wraps live DefiLlama &amp; CoinGecko data into a single verifiable 0–100 risk
              score any agent can act on.
            </p>
            <button
              onClick={() => document.getElementById("scorer")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                marginTop: 22, background: ORANGE, color: "#fff", border: `1px solid ${INK}`,
                padding: "12px 26px", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
              }}>
              RUN A RISK SCORE →
            </button>
          </div>
          <div style={{ padding: "26px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignContent: "center" }}>
            {[
              { k: "COMPONENTS", v: "06" },
              { k: "DATA SOURCES", v: "04" },
              { k: "HACKS INDEXED", v: "589" },
              { k: "SCORE RANGE", v: "0–100" },
            ].map(s => (
              <div key={s.k}>
                <div className="techno" style={{ fontSize: 30, fontWeight: 700, color: INK, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "#787878", marginTop: 6 }}>{s.k}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scorer ── */}
      <section id="scorer" style={{ padding: "40px 28px", borderBottom: `1px solid ${INK}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <Kicker>LIVE RISK QUERY</Kicker>

          {/* example chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {EXAMPLES.map(ex => (
              <button key={ex.label} onClick={() => query(ex.body)} style={{
                background: "transparent", border: `1px solid ${LINE}`,
                padding: "6px 12px", fontSize: 11, letterSpacing: "0.06em", color: "#2A2A2A",
              }}>{ex.label}</button>
            ))}
          </div>

          {/* form */}
          <Framed pad={22} style={{ marginBottom: 22 }}>
            <form onSubmit={submit} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              {/* Chain dropdown */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#787878" }}>CHAIN</span>
                <div style={{ position: "relative" }}>
                  <select
                    value={chain}
                    onChange={e => setChain(e.target.value)}
                    style={SELECT_STYLE}
                  >
                    {chains.length === 0 && <option value={chain}>{chain}</option>}
                    {chains.map(c => (
                      <option key={c.chain} value={c.chain}>
                        {c.chain} · {fmtUsd(c.tvlUsd)}
                      </option>
                    ))}
                  </select>
                  <Caret />
                </div>
              </label>

              {/* Asset — free text, with live suggestions for the selected chain */}
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "#787878" }}>
                  ASSET <span style={{ color: "#9E9E9E", fontWeight: 400 }}>· TYPE ANY TOKEN</span>
                </span>
                <input
                  value={asset}
                  onChange={e => setAsset(e.target.value.toUpperCase())}
                  list="asset-options"
                  placeholder="USDC, WETH, CBBTC…"
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: "100%", border: `1px solid ${INK}`, background: "#EFEFE5",
                    padding: "10px 12px", fontSize: 13, fontFamily: "Roboto Mono, monospace",
                    color: INK, borderRadius: 0,
                  }}
                />
                <datalist id="asset-options">
                  {assets.map(a => (
                    <option key={a.asset} value={a.asset}>{a.pools} pools · {fmtUsd(a.tvlUsd)}</option>
                  ))}
                </datalist>
              </label>

              <button type="submit" disabled={loading} style={{
                background: loading ? "#C4C4B8" : ORANGE, color: "#fff", border: `1px solid ${INK}`,
                padding: "11px 26px", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                cursor: loading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              }}>
                {loading ? "SCANNING…" : "FIND SAFEST →"}
              </button>
            </form>
            <p style={{ fontSize: 11, color: "#787878", marginTop: 14, letterSpacing: "0.03em" }}>
              No protocol slug needed — type any asset and Arcadian finds every protocol
              offering it on {chain}, then ranks them by risk.
              {assets.length > 0 && ` ${assets.length} assets have live pools on this chain.`}
            </p>
          </Framed>

          {/* error — offers real alternatives when a typed asset finds nothing */}
          {result?.error && (
            <div style={{ border: `1px solid #C62828`, background: "#FBEDED", padding: "14px 18px", fontSize: 12, color: "#C62828", letterSpacing: "0.06em" }}>
              {result.error}
              {result.suggestions && result.suggestions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#7A4A4A", marginBottom: 8 }}>
                    TRY ONE OF THESE ON {result.query?.chain?.toUpperCase() ?? chain.toUpperCase()}:
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {result.suggestions.map(s => (
                      <button
                        key={s}
                        onClick={() => { setAsset(s); query({ chain, asset: s }); }}
                        style={{
                          background: "#fff", border: `1px solid #C62828`, color: "#C62828",
                          padding: "5px 11px", fontSize: 11, letterSpacing: "0.06em", cursor: "pointer",
                        }}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ranked protocol table — the auto-discovered result set */}
          {result && !result.error && result.ranked && result.ranked.length > 0 && (
            <Framed pad={0} style={{ marginBottom: 22 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "16px 22px", borderBottom: `1px solid ${INK}`, flexWrap: "wrap", gap: 10,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: INK }}>
                  {result.chain?.toUpperCase()} · {result.asset} — RANKED SAFEST FIRST
                </div>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "#787878" }}>
                  {result.protocols_scanned} PROTOCOLS · {result.pools_scanned} POOLS FOUND
                </div>
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "40px 1fr 110px 90px 120px",
                padding: "10px 22px", borderBottom: `1px solid ${LINE}`,
                fontSize: 10, letterSpacing: "0.12em", color: "#787878", fontWeight: 700,
              }}>
                <span>#</span><span>PROTOCOL</span><span>TVL</span><span>APY</span><span>RISK</span>
              </div>

              {result.ranked.map((row, i) => {
                const rv = VERDICTS[row.verdict] ?? VERDICTS.MEDIUM_RISK;
                return (
                  <div key={row.protocol} style={{
                    display: "grid", gridTemplateColumns: "40px 1fr 110px 90px 120px",
                    alignItems: "center", padding: "13px 22px",
                    borderBottom: i < result.ranked!.length - 1 ? `1px solid ${LINE}` : "none",
                    background: i === 0 ? "#FCF6F1" : "transparent",
                    fontSize: 12,
                  }}>
                    <span className="techno" style={{ fontWeight: 700, color: i === 0 ? ORANGE : "#9E9E9E" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ fontWeight: i === 0 ? 700 : 500, color: INK }}>
                      {row.protocol}
                      <span style={{ color: "#9E9E9E", marginLeft: 8, fontSize: 10 }}>
                        {row.pools_scored}/{row.pools_available} pools
                      </span>
                    </span>
                    <span style={{ color: "#3A3A3A" }}>{fmtUsd(row.tvl_usd)}</span>
                    <span style={{ color: "#3A3A3A" }}>{row.apy.toFixed(2)}%</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="techno" style={{ fontWeight: 700, color: rv.color, fontSize: 14 }}>
                        {String(row.risk_score).padStart(2, "0")}
                      </span>
                      <span style={{
                        background: rv.color, color: "#fff", fontSize: 9,
                        padding: "2px 6px", letterSpacing: "0.08em", fontWeight: 700,
                      }}>{rv.label.replace(" RISK", "")}</span>
                    </span>
                  </div>
                );
              })}
            </Framed>
          )}

          {/* detail panel — the safest protocol in ranked mode */}
          {result && !result.error && v && (
            <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 22 }}>
              {/* left: gauge */}
              <Framed pad={22} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                {result.ranked && (
                  <div style={{ fontSize: 10, letterSpacing: "0.14em", color: ORANGE, fontWeight: 700 }}>
                    SAFEST OPTION
                  </div>
                )}
                <ScoreGauge score={result.risk_score} verdict={result.verdict} />
                <div style={{ background: v.color, color: "#fff", padding: "6px 16px", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>
                  {v.label}
                </div>
                <div style={{ width: "100%", borderTop: `1px solid ${LINE}`, paddingTop: 12, fontSize: 11, lineHeight: 1.9, color: "#3A3A3A" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#787878" }}>PROTOCOL</span><span>{result.protocol}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#787878" }}>CHAIN</span><span>{result.chain}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#787878" }}>ASSET</span><span>{result.symbol}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#787878" }}>APY</span><span>{(result.apy_bps / 100).toFixed(2)}%</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#787878" }}>TVL</span><span>{tvlStr}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#787878" }}>CONFIDENCE</span><span>{result.confidence}%</span></div>
                </div>
              </Framed>

              {/* right: components + explanation */}
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <Framed pad={22}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: INK, marginBottom: 18 }}>COMPONENT BREAKDOWN</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 34px" }}>
                    {COMPONENTS.map(c => (
                      <RiskBar key={c.key} label={c.label} value={result.components[c.key] ?? 0} max={c.max} />
                    ))}
                  </div>
                </Framed>

                {result.explanation && (
                  <div style={{ border: `1px solid ${INK}`, borderLeft: `4px solid ${v.color}`, background: "#FCFCF7", padding: "16px 20px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "#787878", marginBottom: 8 }}>AI ASSESSMENT</div>
                    <p style={{ fontSize: 13, lineHeight: 1.7, color: "#2A2A2A" }}>{result.explanation}</p>
                    {result.flags.length > 0 && (
                      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {result.flags.map((f, i) => (
                          <span key={i} style={{ border: "1px solid #C62828", color: "#C62828", fontSize: 11, padding: "3px 9px", letterSpacing: "0.04em" }}>⚠ {f}</span>
                        ))}
                      </div>
                    )}
                    {result.data_sources && result.data_sources.length > 0 && (
                      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {result.data_sources.map(s => (
                          <span key={s} style={{ background: "#EFEFE5", border: `1px solid ${LINE}`, fontSize: 10, padding: "3px 8px", letterSpacing: "0.06em", color: "#787878" }}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Methodology ── */}
      <section style={{ padding: "40px 28px", borderBottom: `1px solid ${INK}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <Kicker>SCORING METHODOLOGY · 100 PTS</Kicker>
          <div style={{ border: `1px solid ${INK}`, display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
            {METHODOLOGY.map((c, i) => (
              <div key={c.label} style={{
                padding: "20px 22px",
                borderRight: (i % 3 !== 2) ? `1px solid ${LINE}` : "none",
                borderBottom: (i < 3) ? `1px solid ${LINE}` : "none",
                background: "#FCFCF7",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <span className="techno" style={{ fontSize: 22, fontWeight: 700, color: ORANGE }}>{c.n}</span>
                  <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "#787878" }}>{c.pts}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 8 }}>{c.label}</div>
                <p style={{ fontSize: 11, lineHeight: 1.6, color: "#6A6A6A" }}>{c.desc}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#787878", marginTop: 14, lineHeight: 1.7, letterSpacing: "0.03em" }}>
            All data sourced live from DefiLlama (pools · hacks · protocols) &amp; CoinGecko. Lower score = safer.
            Telegraph on-chain integers: risk_score · apy_bps · tvl_k · confidence.
          </p>
        </div>
      </section>

      {/* ── API ── */}
      <section style={{ padding: "40px 28px", borderBottom: `1px solid ${INK}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <Kicker>API REFERENCE</Kicker>
          <div style={{ background: INK, border: `1px solid ${INK}`, padding: "22px 24px", fontFamily: "Roboto Mono, monospace", fontSize: 12.5, lineHeight: 2, color: "#9E9E9E" }}>
            <div><span style={{ color: ORANGE }}>POST</span> <span style={{ color: "#EFEFE5" }}>/api/telegraph/risk</span></div>
            <div style={{ color: "#555" }}>Content-Type: application/json</div>
            <div style={{ marginTop: 8, color: "#555" }}>{"//"} DISCOVERY MODE — no protocol slug needed</div>
            <div>{"{"}</div>
            <div>&nbsp;&nbsp;<span style={{ color: "#EFEFE5" }}>"chain"</span>: <span style={{ color: ORANGE }}>"Base"</span>,</div>
            <div>&nbsp;&nbsp;<span style={{ color: "#EFEFE5" }}>"asset"</span>: <span style={{ color: ORANGE }}>"USDC"</span></div>
            <div>{"}"}</div>
            <div style={{ marginTop: 12, color: "#555" }}>{"//"} RESPONSE</div>
            <div><span style={{ color: "#EFEFE5" }}>mode</span> <span style={{ color: "#9E9E9E" }}>ranked</span></div>
            <div><span style={{ color: "#EFEFE5" }}>safest</span> <span style={{ color: "#9E9E9E" }}>protocol slug with the lowest score</span></div>
            <div><span style={{ color: "#EFEFE5" }}>ranked[]</span> <span style={{ color: "#9E9E9E" }}>every protocol, safest first</span></div>
            <div><span style={{ color: "#EFEFE5" }}>risk_score</span> <span style={{ color: "#9E9E9E" }}>int 0–100</span>  <span style={{ color: "#555" }}>// lower = safer</span></div>
            <div><span style={{ color: "#EFEFE5" }}>verdict</span> <span style={{ color: "#9E9E9E" }}>LOW | MEDIUM | HIGH | VERY_HIGH</span></div>
            <div><span style={{ color: "#EFEFE5" }}>apy_bps · tvl_k · confidence</span> <span style={{ color: "#9E9E9E" }}>on-chain integers</span></div>
            <div><span style={{ color: "#EFEFE5" }}>components</span> <span style={{ color: "#9E9E9E" }}>6-component breakdown</span></div>
            <div><span style={{ color: "#EFEFE5" }}>explanation</span> <span style={{ color: "#9E9E9E" }}>AI narrative (Qwen)</span></div>
            <div style={{ marginTop: 12, color: "#555" }}>{"//"} DIRECT MODE — pin one protocol</div>
            <div>{"{"} <span style={{ color: "#EFEFE5" }}>"protocol"</span>: <span style={{ color: ORANGE }}>"aave-v3"</span>, <span style={{ color: "#EFEFE5" }}>"chain"</span>: <span style={{ color: ORANGE }}>"Base"</span> {"}"}</div>
            <div style={{ marginTop: 12 }}><span style={{ color: ORANGE }}>GET</span> <span style={{ color: "#EFEFE5" }}>/api/telegraph/universe?chain=Base</span></div>
            <div style={{ color: "#555" }}>{"//"} live chain + asset lists that back the pickers</div>
          </div>
        </div>
      </section>

      {/* ── Data source strip (partner-logo style) ── */}
      <section style={{ borderBottom: `1px solid ${INK}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gridTemplateColumns: "auto repeat(4, 1fr)" }}>
          <div style={{ padding: "22px 22px", borderRight: `1px solid ${LINE}`, display: "flex", alignItems: "center", fontSize: 10, letterSpacing: "0.16em", color: "#787878" }}>
            DATA SOURCES:
          </div>
          {SOURCES.map((s, i) => (
            <div key={s} style={{
              padding: "22px", display: "flex", alignItems: "center", justifyContent: "center",
              borderRight: i < SOURCES.length - 1 ? `1px solid ${LINE}` : "none",
            }}>
              <span className="techno" style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.02em", color: INK }}>{s}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ padding: "22px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "#787878" }}>
          ARCADIAN · DEFI RISK ORACLE · TELEGRAPH MINER SEASON I · 2026
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 7, height: 7, background: ORANGE }} />
          <span style={{ fontSize: 10, letterSpacing: "0.1em", color: "#787878" }}>BASE SEPOLIA · REGISTERED AUG 17</span>
        </div>
      </footer>
    </div>
  );
}
