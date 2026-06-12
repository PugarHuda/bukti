// bukti-bot core — shared, transport-agnostic chain reads + message formatting.
//
// Every number here is read live from Mantle and is backed by a Groth16 proof verified
// on-chain (BuktiAttestation) — nothing is self-reported. The Telegram and Discord
// surfaces (Track 02 asks for "via Telegram and Discord") are thin wrappers over this.
import { createPublicClient, http, parseAbi, parseAbiItem, isAddress } from "viem";

export const RPC = "https://rpc.sepolia.mantle.xyz";
export const ATTEST = "0x2EB832F24136c24A3B38D4b06D3318C48B618163" as const;
export const VAULT = "0x851C251411Fe4F4bab586F775c7450f86A348EAD" as const;
export const VALIDATOR = "0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0" as const;
export const BATCH_TX = "0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6";
export const DEPLOY_BLOCK = 39795000n;
export const EXPLORER = "https://sepolia.mantlescan.xyz";

const client = createPublicClient({ transport: http(RPC) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry transient public-RPC blips so a single bad response never fails a user command. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
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
const VALIDATOR_ABI = parseAbi(["function validationScore(address) view returns (uint8, bool)"]);
const EV = parseAbiItem(
  "event AttestationSubmitted(address indexed wallet, address indexed attester, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, bytes32 anchorBlockHash)",
);

export interface ScoreCard {
  wallet: string;
  score: number;
  roiPct: number;
  maxDrawdownPct: number;
  volumeUsd: number;
  realizedTrades: number;
  validation100: number;
  vaultApproved: boolean;
  minSharpe: number;
}

export function normalizeAddress(input: string): `0x${string}` {
  const a = (input || "").trim().toLowerCase();
  if (!isAddress(a)) throw new Error(`not a valid address: ${input}`);
  return a as `0x${string}`;
}

/** Full proven score card for a wallet, or null if it has no on-chain attestation. */
export async function getScoreCard(wallet: `0x${string}`): Promise<ScoreCard | null> {
  const a = await withRetry(() =>
    client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [wallet] }),
  );
  if (!a.exists) return null;

  const [validation100] = await withRetry(() =>
    client.readContract({ address: VALIDATOR, abi: VALIDATOR_ABI, functionName: "validationScore", args: [wallet] }),
  );
  const approved = await withRetry(() =>
    client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "approvedAgent", args: [wallet] }),
  );
  const minSharpe = await withRetry(() =>
    client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "minSharpeMilli" }),
  );

  return {
    wallet,
    score: Number(a.sharpeMilli) / 1000,
    roiPct: Number(a.roiBps) / 100,
    maxDrawdownPct: a.maxDrawdownBps / 100,
    volumeUsd: Number(a.volumeUsdE6) / 1e6,
    realizedTrades: a.numTrades,
    validation100: Number(validation100),
    vaultApproved: Boolean(approved),
    minSharpe: Number(minSharpe) / 1000,
  };
}

/** The live leaderboard, descending by proven score (from on-chain attestation events).
 *  getLogs is chunked to 9000-block windows because the public RPC caps ranges at 10000. */
export async function getLeaderboard(limit = 10): Promise<{ wallet: string; score: number }[]> {
  const head = await withRetry(() => client.getBlockNumber());
  const latest = new Map<string, number>();
  for (let from = DEPLOY_BLOCK; from <= head; from += 9000n) {
    const to = from + 8999n > head ? head : from + 8999n;
    const logs = await withRetry(() =>
      client.getLogs({ address: ATTEST, event: EV, fromBlock: from, toBlock: to }),
    );
    for (const l of logs) {
      const w = (l.args.wallet as string).toLowerCase();
      latest.set(w, Number(l.args.sharpeMilli) / 1000); // later log wins (latest attestation)
    }
  }
  return [...latest.entries()]
    .map(([wallet, score]) => ({ wallet, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---- formatters (plain text; transports add their own emphasis) ----

export function formatScoreCard(c: ScoreCard | null, wallet: string): string {
  if (!c) {
    return [
      `❓ ${short(wallet)} has NO zk-verified attestation on Bukti.`,
      `Any performance claim from it is unverified. ${EXPLORER}/address/${ATTEST}`,
    ].join("\n");
  }
  const verdict = c.vaultApproved ? "✅ VAULT-APPROVED" : "⛔ below vault gate";
  return [
    `🔎 Bukti verified track record — ${short(c.wallet)}`,
    `• Proven score: ${c.score.toFixed(3)}  (per-trade Sharpe-style)`,
    `• ROI: ${c.roiPct.toFixed(2)}%   Max drawdown: ${c.maxDrawdownPct.toFixed(2)}%`,
    `• Realized trades: ${c.realizedTrades}   Volume: $${c.volumeUsd.toFixed(2)}`,
    `• ERC-8004 validation: ${c.validation100}/100`,
    `• Vault gate (${c.minSharpe.toFixed(2)}): ${verdict}`,
    `🔐 zk-verified on-chain (SP1 Groth16). Verify: ${EXPLORER}/address/${ATTEST}#readContract`,
  ].join("\n");
}

export function formatLeaderboard(rows: { wallet: string; score: number }[]): string {
  const lines = rows.map((r, i) => `${String(i + 1).padStart(2)}. ${short(r.wallet)}  ${r.score.toFixed(3)}`);
  return [
    `🏆 Bukti — Provable ClawHack Leaderboard (proven score)`,
    ...lines,
    `One 714-byte Groth16 proof attests the whole board. tx ${BATCH_TX.slice(0, 12)}…`,
  ].join("\n");
}

export const HELP = [
  "Bukti — zk-verified trading track records on Mantle.",
  "",
  "/score <address>   — proven score card for a wallet (read live from chain)",
  "/validate <address> — ERC-8004 validation response 0–100",
  "/leaderboard       — top proven traders from the ClawHack cohort",
  "/help              — this message",
  "",
  "Every number is backed by a Groth16 proof verified on-chain — not self-reported.",
].join("\n");
