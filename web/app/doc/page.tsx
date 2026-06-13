"use client";

import { useState } from "react";

/* ── Bukti developer docs — live at /doc. Integration / API reference. ── */

const CONTRACTS = [
  ["BuktiAttestation (105-wallet cohort)", "0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9", "a wallet's proven score"],
  ["BuktiProvenance", "0xa4d6d9932B19f9B03D0439264F1188F39F8522f0", "is this swap genuine chain data?"],
  ["BuktiFullProof", "0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB", "metric proven over genuine data"],
  ["BuktiAllocator", "0x6DF2F45f9184346C175a94D783F37C77C8f3B8B2", "capital split by proof"],
  ["BuktiValidator (ERC-8004)", "0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0", "ZK validation responses"],
  ["GatedVault", "0x851C251411Fe4F4bab586F775c7450f86A348EAD", "proof-gated deposits"],
  ["SP1 Groth16 Verifier v6.1.0", "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A", "verify any Bukti proof"],
];

const SECTIONS = [
  { id: "read", n: "1", t: "Read a proven score (the 3-line gate)" },
  { id: "provenance", n: "2", t: "Is a swap genuine chain data?" },
  { id: "route", n: "3", t: "Route capital / gate by proof" },
  { id: "verify", n: "4", t: "Verify a proof yourself" },
  { id: "http", n: "5", t: "HTTP surfaces (badge, x402)" },
  { id: "mcp", n: "6", t: "For AI agents — MCP" },
  { id: "erc8004", n: "7", t: "ERC-8004 registries" },
];

function Code({ lang, children }: { lang: string; children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="code">
      <div className="code-head"><span className="code-lang mono">{lang}</span>
        <button className="code-copy mono" onClick={() => { navigator.clipboard?.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "copied ✓" : "copy"}</button>
      </div>
      <pre><code className="mono">{children}</code></pre>
    </div>
  );
}

export default function Doc() {
  return (
    <div className="doc-shell">
      <aside className="doc-toc">
        <a className="doc-brand mono" href="/">Bukti<span className="zk">zk</span></a>
        <div className="doc-toc-label mono">Integration / API</div>
        <nav>
          <a href="#contracts">Contracts</a>
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`}><span className="mono tn">{s.n}</span> {s.t}</a>)}
        </nav>
        <div className="doc-toc-foot">
          <a href="https://github.com/PugarHuda/bukti" target="_blank" rel="noreferrer">GitHub ↗</a>
          <a href="/dashboard">Dashboard →</a>
        </div>
      </aside>

      <main className="doc-main">
        <header className="doc-hero">
          <h1>Integrate Bukti</h1>
          <p>Turn a wallet/agent&apos;s realized trading record into a <strong>single on-chain number any contract or
          service can trust</strong> — proven in a zkVM, not self-reported. Everything below is a public read:
          no API key, no account.</p>
          <div className="doc-meta mono">
            <span>Chain: Mantle Sepolia (5003)</span><span>·</span>
            <span>RPC: rpc.sepolia.mantle.xyz</span><span>·</span>
            <span>Score unit: sharpeMilli = score × 1000</span>
          </div>
        </header>

        <section id="contracts">
          <h2>Deployed contracts</h2>
          <p className="muted">All source-verified on Mantlescan. Invalid proofs revert.</p>
          <div className="doc-table">
            <table>
              <thead><tr><th>Contract</th><th>Address</th><th>Read it for</th></tr></thead>
              <tbody>
                {CONTRACTS.map(([name, addr, use]) => (
                  <tr key={addr}><td>{name}</td><td className="mono addr">{addr}</td><td className="muted">{use}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="read">
          <h2><span className="sn mono">1</span> Read a wallet&apos;s proven score</h2>
          <p>The one call most integrators need — returns the risk-adjusted score and whether the wallet has any
          attestation at all. <strong>500 = score 0.5.</strong></p>
          <Code lang="solidity">{`interface IBukti {
    function getSharpeMilli(address wallet) external view returns (int64 sharpeMilli, bool exists);
}

// inside your protocol:
(int64 score, bool proven) = IBukti(0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9).getSharpeMilli(agent);
require(proven && score >= 500, "Bukti: no proven track record");`}</Code>
          <Code lang="typescript (viem)">{`import { createPublicClient, http, parseAbi } from "viem";
const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const [milli, exists] = await client.readContract({
  address: "0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9",
  abi: parseAbi(["function getSharpeMilli(address) view returns (int64,bool)"]),
  functionName: "getSharpeMilli", args: [wallet],
});
const score = Number(milli) / 1000; // e.g. 4.685`}</Code>
          <Code lang="cast (cli)">{`cast call 0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9 \\
  "getSharpeMilli(address)(int64,bool)" <wallet> --rpc-url https://rpc.sepolia.mantle.xyz`}</Code>
        </section>

        <section id="provenance">
          <h2><span className="sn mono">2</span> Is a swap genuine Mantle chain data?</h2>
          <p>The differentiator: don&apos;t just trust a number, check the <em>trades</em> are real. <code>getProven</code>
          is true only if a Groth16 proof established the swap log is included in a real Mantle block (receipt-trie
          inclusion + EIP-2935 anchor — no relayer, no trusted indexer).</p>
          <Code lang="cast (cli)">{`cast call 0xa4d6d9932B19f9B03D0439264F1188F39F8522f0 \\
  "getProven(bytes32,uint32)((bytes32,uint32,address,bool))" <blockHash> <txIndex> \\
  --rpc-url https://rpc.sepolia.mantle.xyz

# BuktiFullProof — a metric proven over swaps EACH genuine, in one proof:
cast call 0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB \\
  "latest()(uint32,uint64,bytes32,bool)" --rpc-url https://rpc.sepolia.mantle.xyz`}</Code>
        </section>

        <section id="route">
          <h2><span className="sn mono">3</span> Route capital / gate access by proof</h2>
          <p><strong>BuktiAllocator</strong> previews how capital splits across candidates by proven score (losers get 0).
          <strong> GatedVault</strong> reverts deposits below threshold.</p>
          <Code lang="solidity">{`interface IBuktiAllocator {
    function previewAllocation(address[] calldata candidates, uint256 amount)
        external view returns (uint256[] memory weightsBps, uint256[] memory amounts);
}`}</Code>
        </section>

        <section id="verify">
          <h2><span className="sn mono">4</span> Verify a Bukti proof yourself</h2>
          <p>Every attestation is backed by a real Groth16 proof. Re-verify any with a plain <code>eth_call</code> —
          valid returns, tampered reverts.</p>
          <Code lang="typescript">{`await client.readContract({
  address: "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A",
  abi: parseAbi(["function verifyProof(bytes32 vkey, bytes publicValues, bytes proof) view"]),
  functionName: "verifyProof", args: [vkey, publicValues, proof],
}); // resolves = VALID ; throws = REJECTED

// public-values ABI:
struct BuktiOutput { address wallet; int64 sharpeMilli; uint32 numTrades; uint32 numSwaps; }`}</Code>
        </section>

        <section id="http">
          <h2><span className="sn mono">5</span> HTTP surfaces</h2>
          <div className="doc-table">
            <table>
              <thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
              <tbody>
                <tr><td className="mono">GET /badge/&lt;addr&gt;</td><td className="muted">live SVG score badge</td></tr>
                <tr><td className="mono">GET /api/gate/&lt;addr&gt;</td><td className="muted">x402 gate: 402 if score &lt; 0.5, else 200</td></tr>
                <tr><td className="mono">GET /board-data.json</td><td className="muted">full proven leaderboard (scores == chain)</td></tr>
                <tr><td className="mono">GET /proof-fixture.json</td><td className="muted">a real {`{vkey, publicValues, proof}`}</td></tr>
              </tbody>
            </table>
          </div>
          <Code lang="markdown">{`![Bukti score](https://bukti-smoky.vercel.app/badge/0xe860d0...)`}</Code>
        </section>

        <section id="mcp">
          <h2><span className="sn mono">6</span> For AI agents — MCP server</h2>
          <p>Tools: <code>bukti_get_verified_score</code>, <code>bukti_leaderboard</code>,
          <code>bukti_check_vault_eligibility</code>, <code>bukti_compare_wallets</code>, <code>bukti_proof_info</code>.</p>
          <Code lang="json">{`{ "mcpServers": { "bukti": { "command": "node", "args": ["mcp/dist/server.js"] } } }`}</Code>
        </section>

        <section id="erc8004">
          <h2><span className="sn mono">7</span> ERC-8004 registries</h2>
          <p>Bukti is the drop-in <strong>ZK validator</strong> for Mantle&apos;s ERC-8004 Validation Registry (spec&apos;d for
          ZK validation, ships empty). Scores are also mirrored into the Reputation Registry, so existing ERC-8004
          consumers read Bukti with no special integration.</p>
        </section>

        <div className="doc-summary">
          <p className="mono">// for your README</p>
          <p>We gate/rank by <strong>Bukti</strong> — a zkVM-proven trading track record on Mantle. We call
          <code> getSharpeMilli(wallet)</code>; a wallet only passes if it has an on-chain Groth16 attestation whose
          underlying swaps are proven genuine Mantle chain data. No screenshots, no trusted indexer.</p>
        </div>
      </main>

      <style jsx global>{`
        body { background: var(--bg); }
        .doc-shell { display: grid; grid-template-columns: 260px 1fr; max-width: 1180px; margin: 0 auto; gap: 0; }
        .doc-toc { position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; padding: 28px 20px; border-right: 1px solid var(--line); display: flex; flex-direction: column; gap: 4px; }
        .doc-brand { font-weight: 600; font-size: 16px; color: var(--text); margin-bottom: 18px; }
        .doc-brand .zk { color: var(--accent); }
        .doc-toc-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--faint); margin-bottom: 8px; }
        .doc-toc nav { display: flex; flex-direction: column; gap: 1px; }
        .doc-toc nav a { color: var(--muted); font-size: 13px; padding: 6px 8px; border-radius: 6px; }
        .doc-toc nav a:hover { background: var(--surface); color: var(--text); }
        .doc-toc nav a .tn { color: var(--accent); margin-right: 6px; font-size: 11px; }
        .doc-toc-foot { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
        .doc-toc-foot a { color: var(--muted); font-size: 13px; }

        .doc-main { padding: 40px 44px 100px; min-width: 0; }
        .doc-hero h1 { font-size: 38px; letter-spacing: -0.02em; margin: 0 0 14px; }
        .doc-hero p { font-size: 16px; color: var(--text); max-width: 680px; line-height: 1.6; margin: 0 0 16px; }
        .doc-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--faint); padding-bottom: 8px; }
        .doc-main section { padding: 30px 0; border-top: 1px solid var(--line); }
        .doc-main h2 { font-size: 22px; letter-spacing: -0.01em; margin: 0 0 12px; display: flex; align-items: center; gap: 10px; }
        .sn { width: 26px; height: 26px; display: inline-grid; place-items: center; background: var(--accent-dim); color: var(--accent); border-radius: 7px; font-size: 13px; }
        .doc-main p { color: var(--text); font-size: 15px; line-height: 1.6; max-width: 720px; }
        .doc-main p .muted, .muted { color: var(--muted); }
        .doc-main code { background: var(--surface); padding: 1px 5px; border-radius: 4px; font-size: 13px; }

        .doc-table { overflow-x: auto; margin: 14px 0; border: 1px solid var(--line); border-radius: 10px; }
        .doc-table table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .doc-table th { text-align: left; background: var(--surface); color: var(--muted); font-weight: 500; padding: 10px 14px; font-size: 12px; }
        .doc-table td { padding: 10px 14px; border-top: 1px solid var(--line); }
        .doc-table .addr { font-size: 11.5px; color: var(--accent); }

        .code { margin: 14px 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--surface); }
        .code-head { display: flex; justify-content: space-between; align-items: center; padding: 7px 12px; border-bottom: 1px solid var(--line); background: var(--surface-2); }
        .code-lang { font-size: 11px; color: var(--faint); }
        .code-copy { border: 1px solid var(--line-2); background: var(--bg); color: var(--muted); font-size: 11px; padding: 2px 9px; border-radius: 5px; cursor: pointer; }
        .code-copy:hover { color: var(--text); border-color: var(--accent); }
        .code pre { margin: 0; padding: 14px 16px; overflow-x: auto; }
        .code code { background: none; padding: 0; font-size: 12.5px; line-height: 1.65; color: var(--text); white-space: pre; }

        .doc-summary { margin-top: 30px; padding: 20px 22px; background: var(--accent-dim); border: 1px solid rgba(14,159,110,.22); border-radius: 12px; }
        .doc-summary p:first-child { color: var(--accent); font-size: 12px; margin: 0 0 8px; }
        .doc-summary p { margin: 0; font-size: 14.5px; }

        @media (max-width: 820px) {
          .doc-shell { grid-template-columns: 1fr; }
          .doc-toc { position: static; height: auto; border-right: none; border-bottom: 1px solid var(--line); flex-direction: row; flex-wrap: wrap; align-items: center; }
          .doc-toc nav { flex-direction: row; flex-wrap: wrap; }
          .doc-toc-foot { flex-direction: row; margin: 0; padding: 0; border: none; }
          .doc-main { padding: 24px 18px 80px; }
        }
      `}</style>
    </div>
  );
}
