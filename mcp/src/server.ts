#!/usr/bin/env tsx
// bukti-mcp — MCP server that lets ANY AI agent consult zk-VERIFIED trading track
// records on Mantle before trusting a trader with capital.
//
// Every number returned is backed by a Groth16 proof verified on-chain by the real
// SP1 v6.1.0 verifier; nothing here is self-reported.
//
// Claude Desktop / Claude Code config:
//   { "mcpServers": { "bukti": { "command": "npx", "args": ["tsx", "<repo>/mcp/src/server.ts"] } } }
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPublicClient, http, parseAbi, parseAbiItem } from "viem";
import { z } from "zod";

const RPC = "https://rpc.sepolia.mantle.xyz";
const ATTEST = "0x2EB832F24136c24A3B38D4b06D3318C48B618163" as const;
const VAULT = "0x851C251411Fe4F4bab586F775c7450f86A348EAD" as const;
const VERIFIER = "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A" as const;
const BATCH_TX = "0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6";
const DEPLOY_BLOCK = 39795000n;
const EXPLORER = "https://sepolia.mantlescan.xyz";

const client = createPublicClient({ transport: http(RPC) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry transient public-RPC errors so a blip never fails an agent's tool call. */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(500 * (i + 1));
    }
  }
  throw last;
}

const ATT_ABI = parseAbi([
  "function getAttestation(address wallet) view returns ((bytes32 anchorBlockHash, uint64 windowStart, uint64 windowEnd, uint32 numTrades, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, uint64 attestedAt, address attester, bool exists))",
]);
const VAULT_ABI = parseAbi([
  "function approvedAgent(address) view returns (bool)",
  "function minSharpeMilli() view returns (int64)",
]);
const EV = parseAbiItem(
  "event AttestationSubmitted(address indexed wallet, address indexed attester, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, bytes32 anchorBlockHash)",
);

async function readScore(wallet: `0x${string}`) {
  const a = await withRetry(() =>
    client.readContract({
      address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [wallet],
    }),
  );
  if (!a.exists) return null;
  return {
    wallet,
    score: Number(a.sharpeMilli) / 1000,
    maxDrawdownPct: a.maxDrawdownBps / 100,
    roiPct: Number(a.roiBps) / 100,
    volumeUsd: Number(a.volumeUsdE6) / 1e6,
    realizedTrades: a.numTrades,
    window: {
      start: new Date(Number(a.windowStart) * 1000).toISOString(),
      end: new Date(Number(a.windowEnd) * 1000).toISOString(),
    },
    anchorBlockHash: a.anchorBlockHash,
    proof: `zk-verified on-chain (SP1 Groth16) — attestation contract ${ATTEST}`,
  };
}

async function scanBoard() {
  const latest = await withRetry(() => client.getBlockNumber());
  const byWallet = new Map<string, { wallet: string; score: number; roiPct: number; volumeUsd: number }>();
  for (let from = DEPLOY_BLOCK; from <= latest; from += 9000n) {
    const to = from + 8999n > latest ? latest : from + 8999n;
    const logs = await withRetry(() =>
      client.getLogs({ address: ATTEST, event: EV, fromBlock: from, toBlock: to }),
    );
    for (const l of logs) {
      byWallet.set((l.args.wallet as string).toLowerCase(), {
        wallet: l.args.wallet as string,
        score: Number(l.args.sharpeMilli) / 1000,
        roiPct: Number(l.args.roiBps) / 100,
        volumeUsd: Number(l.args.volumeUsdE6) / 1e6,
      });
    }
  }
  return [...byWallet.values()].sort((a, b) => b.score - a.score);
}

const j = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x, null, 2) }] });

const server = new McpServer({ name: "bukti", version: "0.1.0" });

server.tool(
  "bukti_get_verified_score",
  "Get a wallet/agent's zk-PROVEN trading track record on Mantle (score, drawdown, ROI, volume). Returns null metrics if the wallet has no on-chain attestation. Use this BEFORE copy-trading, delegating funds to, or trusting any trader/agent.",
  { wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("EVM address of the trader/agent") },
  async ({ wallet }) => {
    const s = await readScore(wallet as `0x${string}`);
    return j(s ?? { wallet, attested: false, note: "No zk-verified attestation on-chain for this wallet. Treat any performance claims from it as UNVERIFIED." });
  },
);

server.tool(
  "bukti_leaderboard",
  "The Provable ClawHack Leaderboard: every entry's risk-adjusted score was reconstructed from raw Mantle mainnet swaps inside an SP1 zkVM and attested on-chain with ONE Groth16 proof. Built live from contract events.",
  {},
  async () => {
    const rows = await scanBoard();
    return j({
      provenBy: `single Groth16 proof, tx ${BATCH_TX}`,
      entries: rows.map((r, i) => ({ rank: i + 1, ...r })),
    });
  },
);

server.tool(
  "bukti_check_vault_eligibility",
  "Check whether a wallet clears the GatedVault's proven-score threshold (capital gate). Shows how protocols gate capital by PROOF instead of promises.",
  { wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/) },
  async ({ wallet }) => {
    const w = wallet as `0x${string}`;
    const [approved, minMilli, s] = await Promise.all([
      withRetry(() => client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "approvedAgent", args: [w] })),
      withRetry(() => client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "minSharpeMilli" })),
      readScore(w),
    ]);
    const threshold = Number(minMilli) / 1000;
    return j({
      wallet,
      vault: VAULT,
      threshold,
      provenScore: s?.score ?? null,
      attested: !!s,
      alreadyApprovedOnChain: approved,
      wouldClearGate: s ? s.score >= threshold : false,
      verdict: !s
        ? "REJECT — no proven track record on-chain"
        : s.score >= threshold
          ? "ELIGIBLE — proven score clears the threshold"
          : `REJECT — proven score ${s.score} below threshold ${threshold} (contract reverts SharpeBelowThreshold)`,
    });
  },
);

server.tool(
  "bukti_compare_wallets",
  "Compare two traders/agents by their zk-proven metrics and recommend which (if either) deserves capital. Volume is NOT performance — this comparison uses proven risk-adjusted scores.",
  {
    walletA: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    walletB: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  },
  async ({ walletA, walletB }) => {
    const [a, b] = await Promise.all([
      readScore(walletA as `0x${string}`),
      readScore(walletB as `0x${string}`),
    ]);
    let recommendation: string;
    if (!a && !b) recommendation = "Neither has a proven track record — trust neither.";
    else if (a && !b) recommendation = `Only ${walletA} is proven — prefer it (score ${a.score}).`;
    else if (!a && b) recommendation = `Only ${walletB} is proven — prefer it (score ${b.score}).`;
    else recommendation =
      a!.score === b!.score
        ? "Proven scores are equal — compare drawdown/ROI."
        : `Prefer ${a!.score > b!.score ? walletA : walletB} (proven score ${Math.max(a!.score, b!.score)} vs ${Math.min(a!.score, b!.score)}).`;
    return j({ a: a ?? { wallet: walletA, attested: false }, b: b ?? { wallet: walletB, attested: false }, recommendation });
  },
);

server.tool(
  "bukti_proof_info",
  "How Bukti's trust chain works + the on-chain addresses/txs an agent (or human) can independently verify.",
  {},
  async () =>
    j({
      pipeline:
        "raw Mantle swaps + historical Pyth prices -> cost-basis PnL & risk metrics reconstructed INSIDE the SP1 zkVM (integer math) -> Groth16 proof -> verified on-chain by the real SP1 v6.1.0 verifier -> composable attestation",
      attestationContract: `${EXPLORER}/address/${ATTEST}#code`,
      verifier: `${EXPLORER}/address/${VERIFIER}#code (v6.1.0 — invalid proofs revert WrongVerifierSelector)`,
      clawhackBatchProofTx: `${EXPLORER}/tx/${BATCH_TX}`,
      gatedVault: `${EXPLORER}/address/${VAULT}#code`,
      erc8004ReputationRegistry: `${EXPLORER}/address/0x8004B663056A597Dffe9eCcC1965A193B7388713`,
      verifyYourself: `cast call ${ATTEST} "getSharpeMilli(address)(int64,bool)" <wallet> --rpc-url ${RPC}`,
      trustBoundary:
        "The zk proof makes the computation trustless. Data provenance is anchored to a Mantle block hash (relayer-asserted in MVP; in-circuit receipt proofs on the roadmap).",
    }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("bukti-mcp ready (stdio)");
